const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

class MockField {
    constructor(table, name) {
        this.table = table;
        this.name = name;
    }

    get AsString() {
        const value = this.table.current()[this.name];
        return value == null ? "" : String(value);
    }

    set AsString(value) {
        this.table.current()[this.name] = String(value);
    }

    get AsInteger() {
        return Number(this.table.current()[this.name] || 0);
    }

    set AsInteger(value) {
        this.table.current()[this.name] = Number(value);
    }
}

class MockTable {
    constructor(rows) {
        this.rows = rows;
        this.index = 0;
        this.ControlsDisabled = false;
        this.IsEditMode = false;
    }

    current() {
        if (!this.rows.length) throw new Error("No current row");
        return this.rows[this.index];
    }

    FieldByName(name) {
        if (!this.rows.length || !(name in this.current())) {
            throw new Error(`Missing field ${name}`);
        }
        return new MockField(this, name);
    }

    get RecordCount() { return this.rows.length; }
    get Eof() { return this.index >= this.rows.length; }
    get First() { this.index = 0; return true; }
    get Next() { this.index += 1; return true; }
    get Edit() { this.IsEditMode = true; return true; }
    get Post() { this.IsEditMode = false; return true; }
    get DisableControls() { this.ControlsDisabled = true; return true; }
    get EnableControls() { this.ControlsDisabled = false; return true; }
}

function createContext({ user, owner = "", customer = "C001", type = 14, lines = 1, save = true, confirm = true, dryRun = false }) {
    const header = new MockTable([{ EVRAKTIP: type, EVRAKNO: "SIP-TEST-1", HESAPKOD: customer, SATICINO: owner }]);
    const lineRows = [];
    for (let i = 0; i < lines; i += 1) {
        lineRows.push({ SIRANO: i + 1, MALKOD: `P${i + 1}`, MASRAFKOD: "", DEPOKOD: "YTM" });
    }
    const detail = new MockTable(lineRows);
    const messages = [];
    let saveCount = 0;

    const dataObject = {};
    Object.defineProperty(dataObject, "Save", {
        get() {
            saveCount += 1;
            return save;
        },
    });

    const context = {
        AppSecurity: { UserName: user },
        EvrakBaslik: { Table: header },
        EvrakHareket: { Table: detail },
        DataApp: { DataObject: dataObject },
        AppConfirm: () => confirm,
        ShowMessage: (message) => messages.push(String(message)),
        console,
        Error,
        Object,
        Array,
    };

    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, "LibMarlinNexusOwnership.js"), "utf8");
    vm.runInContext(source, context, { filename: "LibMarlinNexusOwnership.js" });
    context.MARLIN_NEXUS_DRY_RUN = dryRun;

    return {
        context,
        header,
        detail,
        messages,
        saveCount: () => saveCount,
    };
}

function runCentralDelivery(user, expectedOwner) {
    const test = createContext({ user, lines: 2 });
    test.context.btnMerkezdenTeslimOnClick();
    assert.strictEqual(test.header.rows[0].SATICINO, expectedOwner);
    assert.deepStrictEqual(test.detail.rows.map((row) => row.MASRAFKOD), ["SERVIS", "SERVIS"]);
    assert.deepStrictEqual(test.detail.rows.map((row) => row.DEPOKOD), ["MRK", "MRK"]);
    assert.strictEqual(test.saveCount(), 1);
}

runCentralDelivery("FURKAN", "FURKAN");
runCentralDelivery("BCETINEL", "BCETINEL");
runCentralDelivery("MKARA", "MKARA");

{
    const test = createContext({ user: "CAN", lines: 1 });
    test.context.btnMerkezdenTeslimOnClick();
    assert.strictEqual(test.saveCount(), 0);
    assert.strictEqual(test.header.rows[0].SATICINO, "");
    assert.strictEqual(test.detail.rows[0].DEPOKOD, "YTM");
}

{
    const test = createContext({ user: "FURKAN", owner: "BCETINEL", lines: 1 });
    test.context.btnMerkezdenTeslimOnClick();
    assert.strictEqual(test.saveCount(), 0);
    assert.strictEqual(test.header.rows[0].SATICINO, "BCETINEL");
}

{
    const test = createContext({ user: "FURKAN", customer: "", lines: 1 });
    test.context.btnMerkezdenTeslimOnClick();
    assert.strictEqual(test.saveCount(), 0);
}

{
    const test = createContext({ user: "FURKAN", lines: 0 });
    test.context.btnMerkezdenTeslimOnClick();
    assert.strictEqual(test.saveCount(), 0);
}

{
    const test = createContext({ user: "FURKAN", owner: "FURKAN", lines: 1 });
    test.context.btnMerkezdenTeslimOnClick();
    assert.strictEqual(test.saveCount(), 1);
    assert.strictEqual(test.header.rows[0].SATICINO, "FURKAN");
}

{
    const test = createContext({ user: "FURKAN", lines: 1, confirm: false });
    test.context.btnMerkezdenTeslimOnClick();
    assert.strictEqual(test.saveCount(), 0);
    assert.strictEqual(test.header.rows[0].SATICINO, "");
    assert.strictEqual(test.detail.rows[0].DEPOKOD, "YTM");
}

{
    const test = createContext({ user: "FURKAN", lines: 1, dryRun: true });
    test.context.btnMerkezdenTeslimOnClick();
    assert.strictEqual(test.saveCount(), 0);
    assert.strictEqual(test.header.rows[0].SATICINO, "FURKAN");
    assert.strictEqual(test.detail.rows[0].MASRAFKOD, "SERVIS");
    assert.strictEqual(test.detail.rows[0].DEPOKOD, "MRK");
    assert.ok(test.messages.some((message) => message.includes("belge kaydedilmedi")));
}

{
    const test = createContext({ user: "FURKAN", lines: 1, save: false });
    test.context.btnMerkezdenTeslimOnClick();
    assert.strictEqual(test.saveCount(), 1);
    assert.strictEqual(test.header.rows[0].SATICINO, "");
    assert.strictEqual(test.detail.rows[0].MASRAFKOD, "");
    assert.strictEqual(test.detail.rows[0].DEPOKOD, "YTM");
}

console.log("Merkezden Teslim macro tests passed.");
