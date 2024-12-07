import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl,
  type RequestUrlParam,
  Editor,
} from "obsidian";

import moment from "moment";

interface ImportTodoistSettings {
  todoistApiKey: string;
}

const IMPORT_TODOIST_SETTINGS: ImportTodoistSettings = {
  todoistApiKey: "apiKey",
};

const makeToDoistRequest = async (
  url: string,
  method: string,
  apiKey: string,
  body?: string,
) => {
  const requestParams: RequestUrlParam = {
    url: url,
    method: method,
    body: body,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };

  if (method === "GET") {
    return requestUrl(requestParams)
      .then((res) => res.json)
      .then((res) => {
        return res;
      });
  } else {
    requestUrl(requestParams);
  }
};

interface Task {
  creator_id: string;
  created_at: string;
  assignee_id: string;
  assigner_id: string;
  is_completed: boolean;
  content: string;
  description: string;
  due: {
    date: string;
    is_recurring: boolean;
    datetime: string;
    string: string;
    timezone: string;
  };
  duration: any;
  id: string;
  labels: string[];
  priority: number;
  project_id: string;
  section_id: string;
  parent_id: string;
  comments: Comment[];
}

interface Comment {
  content: string;
  id: string;
  posted_at: string;
  task_id: string;
}

interface Project {
  id: string;
  name: string;
  comment_count: number;
  order: number;
  color: string;
  is_shared: boolean;
  is_favorite: boolean;
  parent_id: string;
  is_inbox_project: boolean;
  is_team_inbox: boolean;
  view_style: string;
  url: string;
}

class ImportAllTasksCommand {
  todoistApiKey: string;
  projects: Record<string, Project> = {};

  constructor(todoistApiKey: string) {
    this.todoistApiKey = todoistApiKey;
  }

  async execute(editor: Editor) {
    return this.loadData().then((tasks) => {
      console.log("Importing all tasks");

      const markdownTasks = tasks.map((task: Task) => {
        return this.transformToMarkdown(task);
      });

      editor.replaceRange(markdownTasks.join("\n---\n"), editor.getCursor());
    });
  }

  private loadData() {
    return this.loadProjects()
      .then(() => {
        return this.allTasks();
      })
      .then((tasks) => {
        const enrichTasksWithComments = tasks.map((task: Task) => {
          return this.withComments(task);
        });

        return Promise.all(enrichTasksWithComments);
      });
  }

  private transformToMarkdown(task: Task) {
    const tags = task.labels
      .map((label: string) => {
        return `#${label}`;
      })
      .join(" ");

    const created = `[created:: ${moment(task.created_at).format("YYYY-MM-DD")}]`;
    const status = task.is_completed ? "x" : " ";
    const description = task.description ? `\n${task.description}\n` : "";
    const comments = task.comments
      .map((comment) => {
        return `${comment.content}`;
      })
      .join("\n\n");

    const due = task.due
      ? `[due:: ${moment(task.due.datetime).format("YYYY-MM-DD")}]`
      : "";
    const id = `[id:: ${task.id}]`;
    const priority = `[priority:: ${["none", "low", "medium", "high", "highest"][task.priority]}]`;
    const project = `#project-${this.projects[task.project_id].name.replace(" ", "-")}`;

    return `- [${status}] ${task.content} ${tags} ${project} ${created} ${priority} ${id} ${due} ${description}\n${comments}\n`;
  }

  private loadProjects() {
    return makeToDoistRequest(
      `https://api.todoist.com/rest/v2/projects`,
      "GET",
      this.todoistApiKey,
    ).then((projects: Project[]) => {
      projects.forEach((project) => {
        this.projects[project.id] = project;
      });
    });
  }

  private allTasks(): Promise<Task[]> {
    return makeToDoistRequest(
      "https://api.todoist.com/rest/v2/tasks",
      "GET",
      this.todoistApiKey,
    );
  }

  private withComments(task: Task): Promise<Task> {
    return makeToDoistRequest(
      `https://api.todoist.com/rest/v2/comments?task_id=${task.id}`,
      "GET",
      this.todoistApiKey,
    ).then((comments) => {
      task.comments = comments;
      return task;
    });
  }
}

class Commander {
  settings: ImportTodoistSettings;

  constructor(settings: ImportTodoistSettings) {
    this.settings = settings;
  }

  async importAllTasks(editor: Editor) {
    const command = new ImportAllTasksCommand(this.settings.todoistApiKey);
    return command.execute(editor);
  }
}

export default class ImportTodoistPlugin extends Plugin {
  settings: ImportTodoistSettings;
  commander: Commander;

  async onload() {
    await this.loadSettings();

    this.commander = new Commander(this.settings);

    this.addCommand({
      id: "import-todoist-all",
      name: "Import all tasks",
      editorCallback: (editor: Editor) => {
        return this.commander.importAllTasks(editor);
      },
    });

    this.addSettingTab(new ImportTodoistSettingsTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign(
      {},
      IMPORT_TODOIST_SETTINGS,
      await this.loadData(),
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ImportTodoistSettingsTab extends PluginSettingTab {
  plugin: ImportTodoistPlugin;

  constructor(app: App, plugin: ImportTodoistPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Todoist API Key")
      .setDesc("")
      .addText((text) =>
        text
          .setPlaceholder("Enter your secret")
          .setValue(this.plugin.settings.todoistApiKey)
          .onChange(async (value) => {
            this.plugin.settings.todoistApiKey = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
