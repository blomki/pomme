-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction (voir ADR 0009). Story A3, ADR 0045.
--
-- Un membre de foyer n'a pas le droit d'écrire dans household_member (réservé aux admins). Les
-- deux gestes qu'il peut faire sur son foyer passent par ces fonctions, qui lisent et écrivent
-- sans la Row Level Security (SECURITY DEFINER) mais vérifient elles-mêmes chaque condition.

-- Détails d'une invitation, pour la page « Rejoindre le foyer » : seulement pour qui détient le
-- jeton (son empreinte). Rien d'autre n'est montré. needs_name : le compte invité n'a pas encore
-- de prénom (compte créé par l'invitation) ; la page le demande alors.
CREATE FUNCTION public.household_invitation_details(p_token_hash text)
RETURNS TABLE (
  amap_id uuid,
  amap_slug text,
  amap_name text,
  household_name text,
  email text,
  expires_at timestamptz,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  needs_name boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT i.amap_id, a.slug, a.name, h.name, i.email, i.expires_at, i.accepted_at, i.cancelled_at,
    coalesce(trim(u.first_name), '') = ''
  FROM public.household_invitation i
  JOIN public.amap a ON a.id = i.amap_id
  JOIN public.household h ON h.id = i.household_id
  LEFT JOIN public."user" u ON u.email = i.email
  WHERE i.token_hash = p_token_hash;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.household_invitation_details(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.household_invitation_details(text) TO pomme_app;
--> statement-breakpoint

-- Accepter une invitation. Le lien n'arrive que dans la boîte mail de la personne invitée : le
-- détenir prouve qu'on contrôle cette adresse, comme un lien de connexion. Pas besoin d'être
-- connecté. Le compte de la personne existe déjà (créé à l'invitation). Conditions : lien ni
-- annulé, ni déjà utilisé, ni expiré ; foyer non archivé ; personne pas déjà dans un foyer de
-- cette AMAP. Prénom et nom ne sont enregistrés que si le compte n'en a pas encore (un compte
-- existant garde son profil). p_member_id : identifiant (UUID v7) de la nouvelle ligne, fourni
-- par l'application. Renvoie « accepted », « invalid », « expired », « name_required » ou
-- « already_member ».
CREATE FUNCTION public.accept_household_invitation(
  p_token_hash text,
  p_member_id uuid,
  p_first_name text,
  p_last_name text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inv public.household_invitation%ROWTYPE;
  invitee public."user"%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.household_invitation WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR inv.cancelled_at IS NOT NULL OR inv.accepted_at IS NOT NULL THEN
    RETURN 'invalid';
  END IF;
  IF inv.expires_at <= now() THEN
    RETURN 'expired';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.household h WHERE h.id = inv.household_id AND h.archived_at IS NOT NULL
  ) THEN
    RETURN 'invalid';
  END IF;
  SELECT * INTO invitee FROM public."user" u WHERE u.email = inv.email;
  IF NOT FOUND THEN
    RETURN 'invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.household_member hm
    WHERE hm.amap_id = inv.amap_id AND hm.user_id = invitee.id AND hm.archived_at IS NULL
  ) THEN
    RETURN 'already_member';
  END IF;
  IF trim(invitee.first_name) = '' THEN
    IF coalesce(trim(p_first_name), '') = '' THEN
      RETURN 'name_required';
    END IF;
    UPDATE public."user"
    SET first_name = left(trim(p_first_name), 60),
        last_name = left(coalesce(trim(p_last_name), ''), 60),
        updated_at = now()
    WHERE id = invitee.id;
  END IF;
  INSERT INTO public.household_member (id, amap_id, household_id, user_id, is_primary, created_by)
  VALUES (p_member_id, inv.amap_id, inv.household_id, invitee.id, false, inv.invited_by);
  UPDATE public.household_invitation SET accepted_at = now(), updated_at = now() WHERE id = inv.id;
  RETURN 'accepted';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.accept_household_invitation(text, uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.accept_household_invitation(text, uuid, text, text) TO pomme_app;
--> statement-breakpoint

-- Retirer un membre de son foyer, dans l'AMAP courante : la personne connectée et la personne
-- retirée sont membres du même foyer ; on ne se retire pas soi-même. Le membre est archivé (son
-- compte est conservé). S'il était le contact principal, la personne connectée le devient.
-- Renvoie « removed », « self », « not_found » ou « forbidden ».
CREATE FUNCTION public.remove_household_member(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  me uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  current_amap uuid := nullif(current_setting('app.amap_id', true), '')::uuid;
  my_household uuid;
  was_primary boolean;
BEGIN
  SELECT hm.household_id INTO my_household FROM public.household_member hm
  WHERE hm.user_id = me AND hm.amap_id = current_amap AND hm.archived_at IS NULL;
  IF my_household IS NULL THEN
    RETURN 'forbidden';
  END IF;
  IF p_user_id = me THEN
    RETURN 'self';
  END IF;
  SELECT hm.is_primary INTO was_primary FROM public.household_member hm
  WHERE hm.user_id = p_user_id AND hm.household_id = my_household AND hm.archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  UPDATE public.household_member
  SET archived_at = now(), is_primary = false, updated_at = now()
  WHERE user_id = p_user_id AND household_id = my_household AND archived_at IS NULL;
  IF was_primary THEN
    UPDATE public.household_member SET is_primary = true, updated_at = now()
    WHERE user_id = me AND household_id = my_household AND archived_at IS NULL;
  END IF;
  RETURN 'removed';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.remove_household_member(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.remove_household_member(uuid) TO pomme_app;
