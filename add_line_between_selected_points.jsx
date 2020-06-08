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

var doc = app.activeDocument;
sels = app.activeDocument.selection;
if (sels.length > 0){
    points = sels[0].pathPoints;
    if(points == undefined){
        alert("please ungroup and uncompoundpath");
    }
    var list = []
    for (var i = 0; i < points.length; i++) {
        if(points[i].selected == PathPointSelection.ANCHORPOINT){
            list.push(points[i].anchor)
        }
    }

    if(list.length < 2){
        alert("too few points");
    }

    add_line(list[0], list[1]);
}

app.executeMenuCommand('group');
app.executeMenuCommand("Live Pathfinder Exclude");
app.executeMenuCommand('expandStyle');
app.executeMenuCommand('ungroup');