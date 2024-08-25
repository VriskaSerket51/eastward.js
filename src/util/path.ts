export default {
  join: (...names: string[]) => {
    return names.join("/");
  },
  dirname: (filePath: string) => {
    const names = filePath.split("/");
    names.pop();
    return names.join("/");
  },
};
