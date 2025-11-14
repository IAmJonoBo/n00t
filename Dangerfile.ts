import { danger, warn, message } from "danger";

const mdChanged: string[] = danger.git.modified_files.filter(
  (f: string) => f.endsWith(".adoc") || f.endsWith(".md"),
);

async function checkReviewDates() {
  if (mdChanged.length) {
    message(`Docs changed: ${mdChanged.length} files`);
    for (const f of mdChanged) {
      const file: string = f;
      const content = await danger.github.utils.fileContents(file);
      if (!/^:reviewed:\s?\d{4}-\d{2}-\d{2}/m.test(content)) {
        warn(`Missing :reviewed: date in ${f}`);
      }
    }
  }
}

checkReviewDates();
