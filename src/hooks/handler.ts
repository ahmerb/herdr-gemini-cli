import { HerdrClient } from "../herdr/client.js";
import { GeminiHookInput, GeminiHookOutput } from "../types/gemini.js";

export async function handleHook(
  input: GeminiHookInput,
  client: HerdrClient = new HerdrClient()
): Promise<GeminiHookOutput> {
  if (!client.isHerdrActive()) {
    return {};
  }

  const eventName = input.hook_event_name;
  const sessionId = input.session_id;

  switch (eventName) {
    case "SessionStart": {
      const resumeArgv = client.buildResumeCommand(sessionId);
      await client.reportAgent({
        state: "idle",
        sessionId,
        resumeArgv,
      });
      break;
    }

    case "BeforeAgent": {
      await client.reportAgent({
        state: "working",
        sessionId,
      });
      break;
    }

    case "Notification": {
      const notifInput = input as {
        notification_type?: string;
        message?: string;
        details?: Record<string, unknown>;
      };

      if (notifInput.notification_type === "ToolPermission") {
        const toolName =
          (typeof notifInput.details?.tool_name === "string" &&
            notifInput.details.tool_name) ||
          "action";
        const message =
          notifInput.message || `Waiting for approval to run ${toolName}`;

        await client.reportAgent({
          state: "blocked",
          message,
          sessionId,
        });
      }
      break;
    }

    case "BeforeTool": {
      // If we were blocked waiting for approval, transitioning into BeforeTool means tool approved
      await client.reportAgent({
        state: "working",
        sessionId,
      });
      break;
    }

    case "AfterAgent": {
      await client.reportAgent({
        state: "idle",
        sessionId,
      });
      break;
    }

    case "SessionEnd": {
      await client.releaseAgent();
      break;
    }

    default:
      // Other events are ignored without reporting
      break;
  }

  return {};
}
