import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// ---- fs mocks ----
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));
vi.mock("node:fs", () => ({ existsSync: vi.fn() }));

// ---- readline mock — simulates user typing cookie values ----
const mockQuestion = vi.fn();
const mockClose = vi.fn();
vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({ question: mockQuestion, close: mockClose })),
}));

const { runSetupWizard, ensureConfig } = await import(
  "../../../src/cli/setup.js"
);

// 5 answers: 4 cookies + optional deviceSessionToken (empty = skip)
const COOKIE_ANSWERS = ["at-value", "sess-value", "ubid-value", "xmain-value", ""];

describe("runSetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let call = 0;
    mockQuestion.mockImplementation(() =>
      Promise.resolve(COOKIE_ANSWERS[call++] ?? ""),
    );
  });

  it("prompts for all four cookies plus optional device token", async () => {
    await runSetupWizard("config/config.json");
    expect(mockQuestion).toHaveBeenCalledTimes(5);
  });

  it("writes config.json with the collected cookies", async () => {
    await runSetupWizard("config/config.json");
    expect(writeFile).toHaveBeenCalledOnce();
    const [path, content] = (writeFile as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, string, string];
    expect(path).toBe("config/config.json");
    const parsed = JSON.parse(content) as { kindle: { cookies: Record<string, string> } };
    expect(parsed.kindle.cookies).toEqual({
      atMain: "at-value",
      sessionId: "sess-value",
      ubidMain: "ubid-value",
      xMain: "xmain-value",
    });
  });

  it("creates the config directory", async () => {
    await runSetupWizard("config/config.json");
    expect(mkdir).toHaveBeenCalledWith("config", { recursive: true });
  });

  it("trims whitespace from pasted values", async () => {
    mockQuestion.mockReset();
    let call = 0;
    const padded = COOKIE_ANSWERS.map((v) => `  ${v}  `);
    mockQuestion.mockImplementation(() => Promise.resolve(padded[call++] ?? ""));
    await runSetupWizard("config/config.json");
    const [, content] = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content) as { kindle: { cookies: Record<string, string> } };
    expect(parsed.kindle.cookies.atMain).toBe("at-value");
  });

  it("returns a Config object with the collected values", async () => {
    const config = await runSetupWizard("config/config.json");
    expect(config.kindle?.cookies.atMain).toBe("at-value");
  });

  it("omits deviceSessionToken when the user leaves it blank", async () => {
    await runSetupWizard("config/config.json");
    const [, content] = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content) as { kindle: Record<string, unknown> };
    expect(parsed.kindle["deviceSessionToken"]).toBeUndefined();
  });

  it("saves deviceSessionToken when the user provides one", async () => {
    mockQuestion.mockReset();
    let call = 0;
    const answers = ["at-value", "sess-value", "ubid-value", "xmain-value", "tok-xyz"];
    mockQuestion.mockImplementation(() => Promise.resolve(answers[call++] ?? ""));
    await runSetupWizard("config/config.json");
    const [, content] = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content) as { kindle: Record<string, unknown> };
    expect(parsed.kindle["deviceSessionToken"]).toBe("tok-xyz");
  });

  it("closes the readline interface", async () => {
    await runSetupWizard("config/config.json");
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

describe("ensureConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let call = 0;
    mockQuestion.mockImplementation(() =>
      Promise.resolve(COOKIE_ANSWERS[call++] ?? ""),
    );
  });

  it("returns null when config already exists (no wizard)", async () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const result = await ensureConfig("config/config.json");
    expect(result).toBeNull();
    expect(mockQuestion).not.toHaveBeenCalled();
  });

  it("runs the wizard and returns config when file is absent", async () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = await ensureConfig("config/config.json");
    expect(result).not.toBeNull();
    expect(result?.kindle?.cookies.atMain).toBe("at-value");
  });
});
