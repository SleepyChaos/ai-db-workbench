// Preserve license/notice files from installed npm packages in distributable images.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const lock = JSON.parse(
  await readFile(resolve(root, "package-lock.json"), "utf8"),
);
const sections = [
  "# Installed npm dependency notices\nGenerated from the lockfile and installed package contents.\n",
];
for (const path of Object.keys(lock.packages)
  .filter((path) => path.includes("node_modules/"))
  .sort()) {
  const directory = resolve(root, path);
  let pkg;
  try {
    pkg = JSON.parse(
      await readFile(resolve(directory, "package.json"), "utf8"),
    );
  } catch {
    continue;
  }
  const names = await readdir(directory);
  let licenses = names.filter((name) =>
    /^(licen[sc]e|copying|notice|copyright)([.-]|$)/i.test(name),
  );
  if (!licenses.length)
    licenses = names.filter((name) => /^readme([.-]|$)/i.test(name));
  const texts = [];
  for (const name of licenses) {
    try {
      texts.push(
        `--- ${name} ---\n${await readFile(resolve(directory, name), "utf8")}`,
      );
    } catch {}
  }
  sections.push(
    `\n## ${pkg.name}@${pkg.version}\nDeclared license: ${JSON.stringify(pkg.license ?? pkg.licenses ?? "not declared")}\n${texts.join("\n")}`,
  );
}
await writeFile(output, sections.join("\n"));
console.log(`Wrote notices for ${sections.length - 1} installed packages.`);
