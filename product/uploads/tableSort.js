// ==UserScript==
// @name         Universal Table Multi Sort
// @namespace    table.sort.multi
// @version      1.1
// @description  Click header to sort table ASC/DESC with multi-column support
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function(){

function initTable(table){

if(table.dataset.sortableReady) return;
table.dataset.sortableReady = "1";

let headerRow = table.querySelector("thead tr") || table.querySelector("tr");
if(!headerRow) return;

let headers = [...headerRow.children];
let tbody = table.querySelector("tbody") || table;

let rows = [...tbody.querySelectorAll("tr")].slice(1);

if(rows.length===0) return;

let originalRows = [...rows];

let sortStack = [];

headers.forEach((th,colIndex)=>{

th.style.cursor="pointer";
th.dataset.state="none";

th.addEventListener("click",()=>{

let state = th.dataset.state;

if(state==="none") state="asc";
else if(state==="asc") state="desc";
else state="none";

th.dataset.state = state;

sortStack = sortStack.filter(x=>x.col!==colIndex);

if(state!=="none"){
sortStack.push({col:colIndex,dir:state});
}

renderIndicators();
sortTable();

});

});

function renderIndicators(){

headers.forEach(th=>{
let text = th.innerText.replace(/[▲▼]/g,"").trim();
th.innerText = text;
});

sortStack.forEach(s=>{

let th = headers[s.col];
th.innerText += s.dir==="asc"?" ▲":" ▼";

});

}

function getCellValue(tr,col){

let cell = tr.children[col];
if(!cell) return "";

return cell.innerText.trim();

}

function parseNumber(v){

    v = String(v).trim();

    if(!/^-?\d+(\.\d+)?$/.test(v)){
        return null;
    }

    return parseFloat(v);
}

function sortTable(){

if(sortStack.length===0){

rows = [...originalRows];
renderRows();
return;

}

rows.sort((a,b)=>{

for(let s of sortStack){

let A = getCellValue(a,s.col);
let B = getCellValue(b,s.col);

let numA = parseNumber(A);
let numB = parseNumber(B);

let res = 0;

if(numA!==null && numB!==null){
res = numA-numB;
}else{
res = A.localeCompare(B);
}

if(res!==0){
return s.dir==="asc"?res:-res;
}

}

return 0;

});

renderRows();

}


function createPrintBatchButton(){

    // Prevent duplicate
    if (table.dataset.printBatchReady) return;
    table.dataset.printBatchReady = "1";

    // Detect column containing "code"
    const headerRow =
        table.querySelector("thead tr") ||
        table.querySelector("tr");

    if (!headerRow) return;

    const headers = [...headerRow.children].map(th =>
        th.innerText.trim().toLowerCase()
    );

    let codeIndex = -1;
    headers.forEach((text, i) => {
        if (
            text === "code" ||
            text.includes("order id") ||
            text.includes("orderid") ||
            text.includes("resi") ||
            text.includes("invoice") ||
            text.includes("transaction id") ||
            text.includes("txid")
        ) {
            if (codeIndex === -1) codeIndex = i;
        }
    });

    // No code column found
    if (codeIndex === -1) return;

    function getVisibleRows() {
        let rows = [...table.querySelectorAll("tbody tr")];

        if (rows.length === 0) {
            rows = [...table.querySelectorAll("tr")]
                .filter(tr => tr !== headerRow);
        }

        return rows;
    }

    function buildVisibleBatchData() {
        const rows = getVisibleRows();
        const codes = [];

        rows.forEach(tr => {
            const codeCell = tr.children[codeIndex];
            if (!codeCell) return;

            const code = codeCell.innerText.trim();
            if (!code) return;

            codes.push(code);
        });

        return {
            codes: [...new Set(codes)]
        };
    }

    function parseTextareaCodes(textarea) {
        return textarea.value
            .split(/\r?\n|,|;/)
            .map(v => v.trim())
            .filter(Boolean);
    }

    function openBatchMap(finalCodes) {

        const codes = [];
        const seen = {};

        finalCodes.forEach(code => {
            code = String(code || "").trim();
            if (!code) return;
            if (seen[code]) return;
            seen[code] = true;
            codes.push(code);
        });

        if (codes.length === 0) {
            alert("No codes to show.");
            return;
        }

        const csv = codes.join(",");

        // Keep shorter batches readable/shareable with GET.
        // Switch to POST before the query string gets too large.
        if (csv.length <= 1200) {
            const mapWin = window.open(
                "map_batch.php?code=" + encodeURIComponent(csv),
                "_blank"
            );

            if (!mapWin) {
                alert("Popup blocked.");
            }
            return;
        }

        const form = document.createElement("form");
        form.method = "POST";
        form.action = "map_batch.php";
        form.target = "_blank";
        form.style.display = "none";

        const input = document.createElement("textarea");
        input.name = "code";
        input.value = csv;

        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();

        setTimeout(() => {
            form.remove();
        }, 1000);
    }

    // Create button
    const btn = document.createElement("button");
    btn.textContent = "Print Batch";
    btn.style.margin = "4px";
    btn.style.padding = "4px 10px";
    btn.style.fontSize = "12px";

    btn.onclick = function(){

        const batchData = buildVisibleBatchData();
        const uniqueCodes = batchData.codes;

        if (uniqueCodes.length === 0) {
            alert("No codes found.");
            return;
        }

        // Review modal
        const modal = document.createElement("div");
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
        `;

        const box = document.createElement("div");
        box.style.cssText = `
            background: #fff;
            color: #000;
            padding: 16px;
            border-radius: 8px;
            width: min(90vw, 600px);
            max-height: 85vh;
            overflow: auto;
            font-size: 14px;
        `;

        box.innerHTML = `
            <h3 style="margin-top:0">Print Batch Review</h3>
            <div style="margin-bottom:8px">
                Total codes: <b>${uniqueCodes.length.toLocaleString()}</b>
            </div>
            <textarea
                style="
                    width:100%;
                    height:300px;
                    font-family:monospace;
                    font-size:12px;
                    box-sizing:border-box;
                "
            >${uniqueCodes.join("\n")}</textarea>
            <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
                <button id="printBatchCancel"
                        style="padding:6px 12px">
                    Cancel
                </button>
                <button id="printBatchMap"
                        style="padding:6px 12px">
                    Show in map
                </button>
                <button id="printBatchStart"
                        style="padding:6px 12px">
                    Print Batch
                </button>
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

        modal.onclick = function(e){
            if (e.target === modal) modal.remove();
        };

        box.querySelector("#printBatchCancel").onclick = function(){
            modal.remove();
        };

        box.querySelector("#printBatchMap").onclick = function(){
            const textarea = box.querySelector("textarea");
            const finalCodes = parseTextareaCodes(textarea);

            if (finalCodes.length === 0) {
                alert("No codes to show.");
                return;
            }

            openBatchMap(finalCodes);
        };

        box.querySelector("#printBatchStart").onclick = function(){

            const textarea = box.querySelector("textarea");
            const finalCodes = parseTextareaCodes(textarea);

            if (finalCodes.length === 0) {
                alert("No codes to print.");
                return;
            }

            modal.remove();

            // Create POST form (optimized for 10,000+ codes)
            const form = document.createElement("form");
            form.method = "POST";
            form.action = "printbatch.php";
            form.target = "_blank";
            form.style.display = "none";

            const input = document.createElement("textarea");
            input.name = "code";
            input.value = finalCodes.join(",");

            form.appendChild(input);
            document.body.appendChild(form);

            form.submit();

            setTimeout(() => {
                form.remove();
            }, 1000);
        };
    };

    // Insert button before table
    table.parentNode.insertBefore(btn, table);
}
function createPrintButton(){

    // ----------------------------------------------------------
    // Detect header row
    // ----------------------------------------------------------
    const headerRow =
        table.querySelector("thead tr") ||
        table.querySelector("tr");

    if (!headerRow) return;

    // ----------------------------------------------------------
    // Build unique signature:
    // header names + first data row
    // Used to detect duplicate Print buttons.
    // ----------------------------------------------------------
    function normalizeText(text){
        return String(text || "")
            .replace(/[▲▼]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function getRowText(tr){
        if (!tr) return "";
        return [...tr.children]
            .map(td => normalizeText(td.innerText))
            .join("|");
    }

    const firstDataRow =
        table.querySelector("tbody tr") ||
        [...table.querySelectorAll("tr")]
            .find(tr => tr !== headerRow);

    const tableSignature =
        getRowText(headerRow) +
        "||" +
        getRowText(firstDataRow);

    // ----------------------------------------------------------
    // Remove old duplicate buttons with same signature
    // ----------------------------------------------------------
    document.querySelectorAll("button[data-print-signature]").forEach(btn => {
        if (btn.dataset.printSignature === tableSignature) {
            btn.remove();
        }
    });

    // ----------------------------------------------------------
    // Save signature on table
    // ----------------------------------------------------------
    if (table.dataset.printSignature === tableSignature) {
        return;
    }

    table.dataset.printSignature = tableSignature;

    // ----------------------------------------------------------
    // Get clean header names
    // ----------------------------------------------------------
    const headers = [...headerRow.children].map((th, i) => {
        const text = normalizeText(th.innerText);
        return text || ("Column " + (i + 1));
    });

    if (headers.length === 0) return;

    // ----------------------------------------------------------
    // Escape HTML
    // ----------------------------------------------------------
    function escapeHtml(str){
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ----------------------------------------------------------
    // Create button
    // ----------------------------------------------------------
    const btn = document.createElement("button");
    btn.textContent = "Print";
    btn.dataset.printSignature = tableSignature;
    btn.style.margin = "4px";
    btn.style.padding = "4px 10px";
    btn.style.fontSize = "12px";

    // ----------------------------------------------------------
    // Click handler
    // ----------------------------------------------------------
    btn.onclick = function(){

        // Modal overlay
        const modal = document.createElement("div");
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
        `;

        // Modal box
        const box = document.createElement("div");
        box.style.cssText = `
            
            padding: 16px;
            border-radius: 8px;
            max-width: 90%;
            max-height: 80%;
            overflow: auto;
            min-width: 280px;
            font-size: 14px;
        `;

        let html = `<h3 style="margin-top:0">Select Columns to Print</h3>`;

        headers.forEach((name, i) => {
            html += `
                <label style="display:block;margin:6px 0">
                    <input type="checkbox"
                           class="print-col-check"
                           value="${i}"
                           checked>
                    ${escapeHtml(name)}
                </label>
            `;
        });

        html += `
            <div style="margin-top:12px;text-align:right">
                <button id="printCancelBtn"
                        style="margin-right:8px;padding:6px 12px">
                    Cancel
                </button>
                <button id="printStartBtn"
                        style="padding:6px 12px">
                    Print
                </button>
            </div>
        `;

        box.innerHTML = html;
        modal.appendChild(box);
        document.body.appendChild(modal);

        // Close modal
        modal.onclick = function(e){
            if (e.target === modal) modal.remove();
        };

        box.querySelector("#printCancelBtn").onclick = function(){
            modal.remove();
        };

        // Print
        box.querySelector("#printStartBtn").onclick = function(){

            const selected = [...box.querySelectorAll(".print-col-check:checked")]
                .map(cb => parseInt(cb.value, 10));

            if (selected.length === 0) {
                alert("Select at least one column.");
                return;
            }

            modal.remove();

            // Collect rows
            let rows = [...table.querySelectorAll("tbody tr")];

            if (rows.length === 0) {
                rows = [...table.querySelectorAll("tr")]
                    .filter(tr => tr !== headerRow);
            }

            // Build printable HTML
            let printable = "<table>";

            // Header
            
            printable += "</tr></thead>";

            // Body
            printable += "<tbody>";

            rows.forEach(tr => {
                if (!tr.children.length) return;

                printable += "<tr>";

                selected.forEach(index => {
                    const cell = tr.children[index];
                    const text = cell
                        ? cell.innerText.trim()
                        : "";

                    printable += "<td>" +
                        escapeHtml(text) +
                        "</td>";
                });

                printable += "</tr>";
            });

            printable += "</tbody></table>";

            // Open print window
            const win = window.open("", "_blank");

            if (!win) {
                alert("Popup blocked.");
                return;
            }

            win.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Print</title>
<style>
@page {
    size: 58mm auto;
    margin: 2mm;
}
html, body {
    width: 54mm;
    margin: 0;
    padding: 0;
    font-family: monospace;
    font-size: 10px;
    line-height: 1.2;
}
table {
    width: 100%;
    border-collapse: collapse;
}
th, td {
    border: 1px solid #000;
    padding: 1mm 0.5mm;
    text-align: left;
    vertical-align: top;
    word-break: break-word;
    white-space: pre-wrap;
}
th {
    font-weight: bold;
}
* {
    box-sizing: border-box;
    color: #000;
    background: #fff;
}
</style>
</head>
<body>
${printable}
<script>
window.onload = function(){
    setTimeout(function(){
        window.print();
        setTimeout(function(){
         //   window.close();
        }, 300);
    }, 200);
};
</script>
</body>
</html>
            `);

            win.document.close();
        };
    };

    // ----------------------------------------------------------
    // Insert before table
    // ----------------------------------------------------------
    table.parentNode.insertBefore(btn, table);
}

function renderRows(){

rows.forEach(r=>tbody.appendChild(r));

}

createReset();
createSummary();
createPrintButton();
createPrintBatchButton();
function showModal(data){

let modal = document.createElement("div");

modal.style.position="fixed";
modal.style.top="0";
modal.style.left="0";
modal.style.width="100%";
modal.style.height="100%";
modal.style.background="rgba(0,0,0,0.7)";
modal.style.display="flex";
modal.style.alignItems="center";
modal.style.justifyContent="center";
modal.style.zIndex="9999";

let box = document.createElement("div");

box.style.background="white";
box.style.color="black";
box.style.padding="20px";
box.style.borderRadius="8px";
box.style.maxHeight="80%";
box.style.overflow="auto";
box.style.minWidth="400px";

let html = "<h3>Item Summary</h3>";
html += "<table border='1' style='border-collapse:collapse;width:100%'>";
html += "<tr><th>Item ID</th><th>Item</th><th>Total Qty</th><th>Price</th><th>Total Subtotal</th></tr>";

for(let id in data){

let d = data[id];

html += "<tr>";
html += "<td>"+id+"</td>";
html += "<td>"+d.item+"</td>";
html += "<td>"+d.qty+"</td>";
html += "<td>"+d.subtotal/d.qty+"</td>";
html += "<td>"+d.subtotal.toLocaleString()+"</td>";
html += "</tr>";

}

html += "</table><br>";

html += "<button id='closeSummary'>Close</button>";

box.innerHTML = html;

modal.appendChild(box);
document.body.appendChild(modal);

document.getElementById("closeSummary").onclick=()=>{
modal.remove();
};

modal.onclick=(e)=>{
if(e.target===modal) modal.remove();
};

}

function createSummary(){

    // Detect table headers
    let headerRow =
        table.querySelector("thead tr") ||
        table.querySelector("tr");

    if(!headerRow) return;

    let headers = [...headerRow.children].map(th =>
        th.innerText.trim().toLowerCase()
    );

    // Required headers
    let hasItemId = headers.some(text =>
        text.includes("item id")
    );

    let hasPrice = headers.some(text =>
        text === "price" || text.includes("price")
    );

    let hasQty = headers.some(text =>
        text === "qty" || text.includes("qty")
    );

    let hasSubtotal = headers.some(text =>
        text === "subtotal" || text.includes("subtotal")
    );

    // If table does not contain required headers,
    // do not attach Summary button.
    if(
        !hasItemId ||
        !hasPrice ||
        !hasQty ||
        !hasSubtotal
    ){
        return;
    }

    // Prevent duplicate button
    if(table.dataset.summaryReady) return;
    table.dataset.summaryReady = "1";

    // Create button
    let btn = document.createElement("button");

    btn.textContent = "Summary";
    btn.style.margin = "4px";
    btn.style.padding = "4px 10px";
    btn.style.fontSize = "12px";

    btn.onclick = ()=>{

        let headers = [...headerRow.children];

        let index = {};

        headers.forEach((th,i)=>{

            let name =
                th.innerText.trim().toLowerCase();

            if(name.includes("item id"))
                index.itemId = i;

            if(
                name === "item" ||
                name.includes("item")
            )
                index.item = i;

            if(name.includes("qty"))
                index.qty = i;

            if(name.includes("subtotal"))
                index.subtotal = i;

            if(name.includes("price"))
                index.price = i;
        });

        let rows =
            table.querySelectorAll(
                "tbody tr, tr"
            );

        let map = {};

        rows.forEach((tr)=>{

            if(tr === headerRow) return;

            let cells = tr.children;
            if(!cells.length) return;

            let itemId =
                cells[index.itemId]
                ?.innerText.trim();

            let item =
                cells[index.item]
                ?.innerText.trim();

            let qty = parseInt(
                (
                    cells[index.qty]
                    ?.innerText || ""
                ).replace(/[^0-9]/g,"")
            ) || 0;

            let sub = parseInt(
                (
                    cells[index.subtotal]
                    ?.innerText || ""
                )
                .replace(/\./g,"")
                .replace(/[^0-9]/g,"")
            ) || 0;

            // Fallback subtotal
            if(!sub && index.price !== undefined){
                let price = parseFloat(
                    (
                        cells[index.price]
                        ?.innerText || ""
                    ).replace(/[^0-9.-]/g,"")
                ) || 0;

                sub = price * qty;
            }

            if(!itemId) return;

            if(!map[itemId]){
                map[itemId] = {
                    item: item,
                    qty: 0,
                    subtotal: 0
                };
            }

            map[itemId].qty += qty;
            map[itemId].subtotal += sub;
        });

        showModal(map);
    };

    // Insert button before table
    table.parentNode.insertBefore(btn, table);
}
function createReset(){

let btn = document.createElement("button");

btn.textContent="Reset Sort";
btn.style.margin="4px";
btn.style.padding="4px 10px";
btn.style.fontSize="12px";

btn.onclick=()=>{

sortStack=[];

headers.forEach(th=>th.dataset.state="none");

rows=[...originalRows];

renderIndicators();
renderRows();

};

table.parentNode.insertBefore(btn,table);

}

}

function scan(){

document.querySelectorAll("table").forEach(initTable);

}

scan();

setInterval(scan,2000);

})();
