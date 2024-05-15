/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import useActionFeedback from "../common/use-action-feedback";
import { useDialogs } from "../common/use-dialogs";
import useIsUnmounted from "../common/use-is-unmounted";
import { useDevice } from "../device/device-hooks";
import { EVENT_PROJECT_UPDATED, Project, VersionAction } from "../fs/fs";
import { useFileSystem } from "../fs/fs-hooks";
import {
  ModuleData,
  extractModuleData,
  isPythonMicrobitModule,
} from "../fs/fs-util";
import { useHexGeneration } from "../fs/hex-hooks";
import { useLanguageServerClient } from "../language-server/language-server-hooks";
import { useLogging } from "../logging/logging-hooks";
import { useSessionSettings } from "../settings/session-settings";
import { useSettings } from "../settings/settings";
import { useSelection } from "../workbench/use-selection";
import { ProjectActions, defaultedProject } from "./project-actions";

/**
 * Hook exposing the main UI actions.
 */
export const useProjectActions = (): ProjectActions => {
  const fs = useFileSystem();
  const hexGen = useHexGeneration();
  const actionFeedback = useActionFeedback();
  const device = useDevice();
  const dialogs = useDialogs();
  const [, setSelection] = useSelection();
  const logging = useLogging();
  const intl = useIntl();
  const client = useLanguageServerClient();
  const [settings, setSettings] = useSettings();
  const [sessionSettings, setSessionSettings] = useSessionSettings();
  const actions = useMemo<ProjectActions>(
    () =>
      new ProjectActions(
        fs,
        hexGen,
        device,
        actionFeedback,
        dialogs,
        setSelection,
        { values: settings, setValues: setSettings },
        { values: sessionSettings, setValues: setSessionSettings },
        intl,
        logging,
        client
      ),
    [
      fs,
      hexGen,
      device,
      actionFeedback,
      dialogs,
      setSelection,
      settings,
      setSettings,
      sessionSettings,
      setSessionSettings,
      intl,
      logging,
      client,
    ]
  );
  return actions;
};

export type DefaultedProject = Omit<Project, "name"> & {
  name: string;
};

/**
 * Hook exposing the project state.
 *
 * This is quite coarse-grained and might need to be split in future.
 */
export const useProject = (): DefaultedProject => {
  const fs = useFileSystem();
  const intl = useIntl();
  const isUnmounted = useIsUnmounted();
  const [state, setState] = useState<DefaultedProject>(
    defaultedProject(fs, intl)
  );
  useEffect(() => {
    setState(defaultedProject(fs, intl));
    const listener = () => {
      if (!isUnmounted()) {
        setState(defaultedProject(fs, intl));
      }
    };
    fs.on(EVENT_PROJECT_UPDATED, listener);
    return () => {
      fs.removeListener(EVENT_PROJECT_UPDATED, listener);
    };
  }, [fs, isUnmounted, intl]);
  return state;
};

interface ProjectTextFileInfo {
  isThirdPartyModule: boolean;
  initialValue: string;
  moduleData: ModuleData | undefined;
}

/**
 * Reads an initial value from the project file system and synchronises back to it.
 */
export const useProjectFileText = (
  filename: string
): [ProjectTextFileInfo | undefined, (text: string) => void] => {
  const fs = useFileSystem();
  const actionFeedback = useActionFeedback();
  const [value, setValue] = useState<ProjectTextFileInfo | undefined>();
  const isUnmounted = useIsUnmounted();
  useEffect(() => {
    const loadData = async () => {
      try {
        if (await fs.exists(filename)) {
          const { data } = await fs.read(filename);
          const text = new TextDecoder().decode(data);
          if (!isUnmounted()) {
            setValue({
              initialValue: text,
              // We don't change this value if the text is edited to become a module
              // as that would abruptly prevent it being edited further.
              isThirdPartyModule: isPythonMicrobitModule(text),
              moduleData: extractModuleData(text),
            });
          }
        }
      } catch (e) {
        actionFeedback.unexpectedError(e);
      }
    };

    loadData();
  }, [fs, filename, actionFeedback, isUnmounted]);

  const handleChange = useCallback(
    (content: string) => {
      try {
        if (value?.isThirdPartyModule) {
          setValue({
            ...value,
            initialValue: content,
            moduleData: extractModuleData(content),
          });
        }
        // We just write back to the filesystem without updating React state.
        fs.write(filename, content, VersionAction.MAINTAIN);
      } catch (e) {
        actionFeedback.unexpectedError(e);
      }
    },
    [fs, filename, actionFeedback, value]
  );

  return [value, handleChange];
};
