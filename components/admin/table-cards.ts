// Phones: every admin table turns into cards (CSS in admin.css, ≤650px). This copies each column header into its
// cells as data-label, so a card reads "Header: value". Tables opt out with data-cards="off".
export function labelTables(root: ParentNode) {
  for (const table of root.querySelectorAll<HTMLTableElement>("table:not([data-cards=off])")) {
    const headers = [...table.querySelectorAll("thead tr:last-child th")].flatMap(th => Array(Number(th.getAttribute("colspan")) || 1).fill(th.textContent?.trim() ?? ""));
    if (!headers.length) continue;
    table.classList.add("is-cards");
    for (const row of table.querySelectorAll("tbody tr, tfoot tr")) {
      let column = 0;
      for (const cell of row.children) {
        if (!cell.hasAttribute("data-label")) cell.setAttribute("data-label", headers[column] ?? "");
        column += Number(cell.getAttribute("colspan")) || 1;
      }
    }
  }
}
