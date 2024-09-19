import PO from "pofile";

export function poToLocale(data: string) {
  const po = PO.parse(data);
  const locale: any = {};
  po.items.map((item) => {
    locale[item.msgid] = item.msgstr[0];
  });
}

export function localeToPO(locale: any) {
  const po = new PO();

  for (const k in locale) {
    const v = locale[k];
    const item = new PO.Item();
    item.msgid = k;
    item.msgstr = [v];
    po.items.push(item);
  }

  return po.toString();
}
