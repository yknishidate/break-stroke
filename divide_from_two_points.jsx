

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

    // add line
    var line = doc.pathItems.add();
    line.stroked = false;
    line.setEntirePath(Array(list[0], list[1]));
    line.selected = true;

    // divide
    app.executeMenuCommand('group');
    app.executeMenuCommand('Live Pathfinder Divide');
    app.executeMenuCommand('expandStyle');
    app.executeMenuCommand('ungroup');
}
