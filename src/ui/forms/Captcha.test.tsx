import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Captcha } from "./Captcha";

const widget = { reset: vi.fn(), destroy: vi.fn() };
const createWidget = vi.fn<(options: Record<string, unknown>) => typeof widget>(() => widget);

vi.mock("@friendlycaptcha/sdk", () => ({
  FriendlyCaptchaSDK: class {
    createWidget = createWidget;
  },
}));

describe("Captcha", () => {
  beforeEach(() => vi.clearAllMocks());

  it("n'affiche rien quand le captcha est désactivé", () => {
    const { container } = render(<Captcha sitekey={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(createWidget).not.toHaveBeenCalled();
  });

  it("crée le widget en français, lancé dès qu'on remplit le formulaire", async () => {
    render(<Captcha sitekey="FCtest" />);
    await waitFor(() => expect(createWidget).toHaveBeenCalledOnce());
    expect(createWidget.mock.calls[0]?.[0]).toMatchObject({
      sitekey: "FCtest",
      language: "fr",
      startMode: "focus",
    });
  });

  it("redémarre le calcul après une réponse du serveur, et se retire proprement", async () => {
    const { rerender, unmount } = render(<Captcha sitekey="FCtest" resetKey={1} />);
    await waitFor(() => expect(createWidget).toHaveBeenCalledOnce());
    rerender(<Captcha sitekey="FCtest" resetKey={2} />);
    expect(widget.reset).toHaveBeenCalled();
    unmount();
    expect(widget.destroy).toHaveBeenCalled();
  });
});
