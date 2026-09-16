import { Action, ActionPanel, Form, Icon, Toast, open, showToast, useNavigation } from "@raycast/api";
import { useMemo, useState } from "react";
import { ManualAuthorization, completeManualAuthorization, createManualAuthorization } from "./spotify-auth";

type ManualSignInFormProps = {
  clientId: string;
  onSignedIn: () => void;
};

export function ManualSignInForm({ clientId, onSignedIn }: Readonly<ManualSignInFormProps>) {
  const { pop } = useNavigation();
  const [pastedInput, setPastedInput] = useState("");
  const [inputError, setInputError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generated once per mount and kept only in memory for the life of this view.
  const [authorization, setAuthorization] = useState<ManualAuthorization | null>(() => {
    try {
      return createManualAuthorization(clientId);
    } catch {
      return null;
    }
  });

  const description = useMemo(
    () =>
      [
        "1. Open the Spotify consent page and approve access.",
        "2. You land on a raycast.com page. Copy the whole URL from the address bar.",
        "3. Paste it below and submit. The code is only valid for about a minute.",
      ].join("\n"),
    [],
  );

  async function openConsentPage() {
    // Re-created on each attempt so an expired code can simply be retried.
    let current = authorization;

    try {
      current = createManualAuthorization(clientId);
      setAuthorization(current);
      await open(current.url);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not open the Spotify consent page",
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function submit() {
    if (!authorization) {
      await showToast({ style: Toast.Style.Failure, title: "Open the Spotify consent page first" });
      return;
    }

    setIsSubmitting(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Completing sign-in..." });

    try {
      await completeManualAuthorization(clientId, authorization.codeVerifier, pastedInput);

      toast.style = Toast.Style.Success;
      toast.title = "Connected to Spotify";
      setInputError(undefined);
      onSignedIn();
      pop();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sign-in error";
      toast.style = Toast.Style.Failure;
      toast.title = "Could not complete sign-in";
      toast.message = message;
      setInputError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={isSubmitting}
      navigationTitle="Sign In Manually"
      actions={
        <ActionPanel>
          <Action title="Complete Sign in" icon={Icon.Check} onAction={submit} />
          <Action
            title="Open Spotify Consent Page"
            icon={Icon.Globe}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
            onAction={openConsentPage}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="How it works" text={description} />
      <Form.TextField
        id="pastedInput"
        title="Redirect URL or Code"
        placeholder="https://raycast.com/redirect?packageName=Extension&code=..."
        value={pastedInput}
        error={inputError}
        onChange={(value) => {
          setPastedInput(value);
          setInputError(undefined);
        }}
      />
    </Form>
  );
}
