var MARLIN_NEXUS_VERSION = "2026.07.20-pilot.1";
var MARLIN_NEXUS_DRY_RUN = true;
var MARLIN_NEXUS_DEPARTMENT_SERVICE = "SERVIS";
var MARLIN_NEXUS_DEPARTMENT_PARTS = "YEDEK_PARCA";
var MARLIN_NEXUS_CENTRAL_DEPOT = "MRK";

function marlinNexusText(aValue) {
    if (aValue == null)
        return "";

    return ("" + aValue).replace(/^\s+|\s+$/g, "");
}

function marlinNexusNormalizeCode(aValue) {
    return marlinNexusText(aValue).toUpperCase();
}

function marlinNexusCurrentUser() {
    return marlinNexusNormalizeCode(AppSecurity.UserName);
}

function marlinNexusIsActiveServiceUser(aUserName) {
    var aCode = marlinNexusNormalizeCode(aUserName);
    return aCode == "FURKAN" || aCode == "BCETINEL" || aCode == "MKARA";
}

function marlinNexusDepartmentForOwner(aOwnerCode) {
    var aCode = marlinNexusNormalizeCode(aOwnerCode);

    if (aCode == "FURKAN" || aCode == "BCETINEL" || aCode == "MKARA" || aCode == "OGENCOGLU")
        return MARLIN_NEXUS_DEPARTMENT_SERVICE;

    return MARLIN_NEXUS_DEPARTMENT_PARTS;
}

function marlinNexusOwnerDisplayName(aOwnerCode) {
    var aCode = marlinNexusNormalizeCode(aOwnerCode);

    if (aCode == "FURKAN") return "Furkan Cakir";
    if (aCode == "BCETINEL") return "Burak Cetinel";
    if (aCode == "MKARA") return "Mehmet Kara";
    if (aCode == "OGENCOGLU") return "O. Gencoglu";
    if (aCode == "NTOKER") return "N. Toker";
    if (aCode == "AERIMLI") return "A. Erimli";

    return aCode;
}

function marlinNexusRequireField(aTable, aFieldName, aBusinessName) {
    try {
        return aTable.FieldByName(aFieldName);
    }
    catch (e) {
        throw new Error(aBusinessName + " alani CPM ekraninda bulunamadi (" + aFieldName + ").");
    }
}

function marlinNexusHeaderOwner() {
    return marlinNexusNormalizeCode(
        marlinNexusRequireField(EvrakBaslik.Table, "SATICINO", "Ticari sorumlu").AsString
    );
}

function marlinNexusCaptureDocumentState() {
    var aState = new Object();
    aState.Owner = marlinNexusRequireField(EvrakBaslik.Table, "SATICINO", "Ticari sorumlu").AsString;
    aState.Lines = new Array();

    with (EvrakHareket.Table) {
        First;
        while (!Eof) {
            var aLine = new Object();
            aLine.Department = marlinNexusRequireField(EvrakHareket.Table, "MASRAFKOD", "Departman").AsString;
            aLine.Depot = marlinNexusRequireField(EvrakHareket.Table, "DEPOKOD", "Depo").AsString;
            aState.Lines.push(aLine);
            Next;
        }
        First;
    }

    return aState;
}

function marlinNexusRestoreDocumentState(aState) {
    if (aState == null)
        return;

    with (EvrakBaslik.Table) {
        Edit;
        FieldByName("SATICINO").AsString = aState.Owner;
        Post;
    }

    var aLineIndex = 0;
    with (EvrakHareket.Table) {
        DisableControls;
        try {
            First;
            while (!Eof && aLineIndex < aState.Lines.length) {
                Edit;
                FieldByName("MASRAFKOD").AsString = aState.Lines[aLineIndex].Department;
                FieldByName("DEPOKOD").AsString = aState.Lines[aLineIndex].Depot;
                Post;
                aLineIndex++;
                Next;
            }
            First;
        }
        finally {
            if (ControlsDisabled)
                EnableControls;
        }
    }
}

function marlinNexusValidateCentralDelivery(aCurrentUser) {
    var aDocumentType = marlinNexusRequireField(EvrakBaslik.Table, "EVRAKTIP", "Evrak tipi").AsInteger;
    if (aDocumentType != 14)
        throw new Error("Merkezden Teslim yalnizca Satis Siparisi (tip 14) ekraninda kullanilabilir.");

    if (!marlinNexusIsActiveServiceUser(aCurrentUser))
        throw new Error("Bu islem yalnizca aktif Servis kullanicilari FURKAN, BCETINEL ve MKARA tarafindan baslatilabilir.");

    var aCustomerCode = marlinNexusText(
        marlinNexusRequireField(EvrakBaslik.Table, "HESAPKOD", "Musteri kodu").AsString
    );
    if (aCustomerCode == "")
        throw new Error("Once musteri secilmelidir.");

    if (EvrakHareket.Table.RecordCount == 0)
        throw new Error("Merkezden teslim edilecek en az bir urun satiri bulunmalidir.");

    EvrakHareket.Table.First;

    var aExistingOwner = marlinNexusHeaderOwner();
    if (aExistingOwner != "" && aExistingOwner != aCurrentUser)
        throw new Error("Siparisin ticari sorumlusu " + aExistingOwner + ". Oturum kullanicisi bu sahipligi degistiremez.");

    marlinNexusRequireField(EvrakHareket.Table, "MASRAFKOD", "Departman");
    marlinNexusRequireField(EvrakHareket.Table, "DEPOKOD", "Depo");

    return aCustomerCode;
}

function btnMerkezdenTeslimOnClick() {
    var aState = null;
    var aSaved = false;

    try {
        var aCurrentUser = marlinNexusCurrentUser();
        var aCustomerCode = marlinNexusValidateCentralDelivery(aCurrentUser);
        var aDepartment = marlinNexusDepartmentForOwner(aCurrentUser);
        var aLineCount = EvrakHareket.Table.RecordCount;

        var aConfirmation =
            (MARLIN_NEXUS_DRY_RUN ? "DENEME MODU: Belge kaydedilmeyecek.\n\n" : "Merkezden teslim kaydi olusturulacak.\n\n") +
            "Ticari sorumlu: " + marlinNexusOwnerDisplayName(aCurrentUser) + " (" + aCurrentUser + ")\n" +
            "Departman: " + aDepartment + "\n" +
            "Karsilayan depo: " + MARLIN_NEXUS_CENTRAL_DEPOT + "\n" +
            "Musteri: " + aCustomerCode + "\n" +
            "Urun satiri: " + aLineCount + "\n\n" +
            (MARLIN_NEXUS_DRY_RUN ? "Alanlar kaydedilmeden hazirlansin mi?" : "Siparis kaydedilsin mi?");

        if (!AppConfirm(aConfirmation))
            return;

        aState = marlinNexusCaptureDocumentState();

        with (EvrakBaslik.Table) {
            Edit;
            FieldByName("SATICINO").AsString = aCurrentUser;
            Post;
        }

        with (EvrakHareket.Table) {
            DisableControls;
            try {
                First;
                while (!Eof) {
                    Edit;
                    FieldByName("MASRAFKOD").AsString = aDepartment;
                    FieldByName("DEPOKOD").AsString = MARLIN_NEXUS_CENTRAL_DEPOT;
                    Post;
                    Next;
                }
                First;
            }
            finally {
                if (ControlsDisabled)
                    EnableControls;
            }
        }

        if (MARLIN_NEXUS_DRY_RUN) {
            ShowMessage(
                "DENEME BASARILI: Alanlar ekranda hazirlandi, belge kaydedilmedi.\n\n" +
                "Ticari sorumlu: " + aCurrentUser + "\n" +
                "Departman: " + aDepartment + "\n" +
                "Depo: " + MARLIN_NEXUS_CENTRAL_DEPOT + "\n\n" +
                "Simdi Kaydet'e basmayin. Iptal Et ile deneme belgesini kapatin."
            );
            return;
        }

        aSaved = DataApp.DataObject.Save;
        if (!aSaved)
            throw new Error("CPM siparisi kaydetmedi.");

        var aDocumentNo = marlinNexusText(EvrakBaslik.Table.FieldByName("EVRAKNO").AsString);
        ShowMessage(
            "Merkezden teslim siparisi kaydedildi.\n\n" +
            "Evrak No: " + aDocumentNo + "\n" +
            "Ticari sorumlu: " + aCurrentUser + "\n" +
            "Departman: " + aDepartment + "\n" +
            "Depo: " + MARLIN_NEXUS_CENTRAL_DEPOT
        );
    }
    catch (e) {
        if (!aSaved && aState != null) {
            try {
                marlinNexusRestoreDocumentState(aState);
            }
            catch (restoreError) {
                ShowMessage(
                    "Alanlar geri alinamadi. Evraki kaydetmeden kapatin.\n\n" +
                    restoreError.message
                );
            }
        }

        ShowMessage("Merkezden Teslim islemi tamamlanamadi.\n\n" + e.message);
    }
}
