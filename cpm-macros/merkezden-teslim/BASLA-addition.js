// Add this block after the existing custom toolbar buttons in BASLA.
var btnMarlinNexusMerkezdenTeslim = TdxBarButton.Create(BarManager);
with (btnMarlinNexusMerkezdenTeslim) {
    Name = "btnMarlinNexusMerkezdenTeslim";
    Caption = "Merkezden Teslim";
    Hint = "Servis satisini Merkez depodan teslim edilmek uzere kaydeder";
    ImageIndex = 98;
    SetEvent(Scripter, "OnClick", "btnMerkezdenTeslimOnClick", true);
    Category = BarManager.Categories.IndexOf("Araçlar");
}
