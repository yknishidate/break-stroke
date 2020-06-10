var doc = app.activeDocument;
doc.layers.add();   // スクリプトから追加するアイテムは全て新しいレイヤに入れる
sels = app.activeDocument.selection;

function add_line(pos1, pos2){
    var line = doc.pathItems.add();

    // stroke
    line.stroked = true;
    var newRGBColor = new RGBColor();
    newRGBColor.red = 255;
    newRGBColor.green = 0;
    newRGBColor.blue = 0;
    line.strokeColor = newRGBColor;

    line.setEntirePath(Array(pos1, pos2));
}

function get_selected_points(selection){
    // pathItem.selectedPath は余分なポイントが含まれているので
    // 適当に線形探索で取る関数を作った（よく分からない）

    points = selection.pathPoints;
    // 選択アイテムがpathItemじゃない場合、pointsがundefinedとなる
    if(points == undefined){
        alert("please ungroup and uncompoundpath!");
    }

    var selected_points = []
    for (var i = 0; i < points.length; i++) {
        if(points[i].selected == PathPointSelection.ANCHORPOINT){
            selected_points.push(points[i].anchor)
        }
    }
    return selected_points;
}

if (sels.length > 0){
    points = get_selected_points(sels[0]);
    if(points.length < 2){
        alert("select 2 points!: " + String(points.length));
    }
    add_line(points[0], points[1]);
}

// app.executeMenuCommand('group');
// app.executeMenuCommand("Live Pathfinder Exclude");
// app.executeMenuCommand('expandStyle');
// app.executeMenuCommand('ungroup');