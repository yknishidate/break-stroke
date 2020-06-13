/*
 *
 * "Break Stroke"
 *
 * Automatic Character Divider for Adobe Illustrator
 * 
 * Copyright (c) 2020 Nishiki(Yuki Nishidate)
 * 
 */


app.executeMenuCommand("outline");
app.executeMenuCommand('ungroup');

doc = app.activeDocument;
pre_sels = doc.selection;

app.executeMenuCommand("noCompoundPath");

sels = doc.selection;
doc.layers.add();

EPS = 0.0001;
MAX = 1000000;
X_AXIS = [1.0, 0.0];


//-----------------------parameters---------------------------
cost_jump_point = 0.5;          // 隣接ポイント以外に飛ぶことに掛かるコスト
weight_distance = 3.0;          // 距離の遠さに掛かるウェイト
weight_direction = 3.0;         // 進行方向からのズレに掛かるウェイト
weight_gradient = 0.2;          // ラインの傾きに掛かるウェイト

// 基本的にはある点から最小コストの点をラインで結ぶ
// ただし、最小コストに近いラインは追加で引ける
// このときの近いかの判定に使う閾値
threshold_second_line = 1.2;

// 線の色
line_color = [255, 0, 0];

//-----------------------vec2---------------------------
function sub(a, b){
    return [a[0] - b[0], a[1] - b[1]];
}

function calc_distance(pos1, pos2){
    var dx = pos1[0] - pos2[0];
    var dy = pos1[1] - pos2[1];
    return Math.sqrt(dx*dx + dy*dy);
}

function calc_length(pos){
    return Math.sqrt(pos[0]*pos[0] + pos[1]*pos[1]);
}

function normalize(pos){
    var len = calc_length(pos);
    return [pos[0]/len, pos[1]/len];
}

function dir(a, b){
    return normalize(sub(b, a));
}

function dot(a, b){
    return a[0]*b[0] + a[1]*b[1];
}

function cross(a, b){
    return a[0]*b[1] - a[1]*b[0];
}


//-----------------------pathpoint---------------------------
function has_left_handle(point){
    // ハンドル位置とアンカー位置が異なればハンドルを持つ
    var anchor = point.anchor;
    var left = point.leftDirection;
    return Math.abs(anchor[0] - left[0]) > EPS || Math.abs(anchor[1] - left[1]) > EPS;
}

function has_right_handle(point){
    // ハンドル位置とアンカー位置が異なればハンドルを持つ
    var anchor = point.anchor;
    var right = point.rightDirection;
    return Math.abs(anchor[0] - right[0]) > EPS || Math.abs(anchor[1] - right[1]) > EPS;
}


//-----------------------line---------------------------
function add_line(pos1, pos2){
    var line = doc.pathItems.add();

    // stroke
    line.stroked = true;
    var newRGBColor = new RGBColor();
    newRGBColor.red = line_color[0];
    newRGBColor.green = line_color[1];
    newRGBColor.blue = line_color[2];
    line.strokeColor = newRGBColor;

    line.setEntirePath([pos1, pos2]);
}

function intersect(edge, line){
    // 線分と線分の交差判定
    // 線分aに対して線分bの頂点が左右両側に存在し、逆も同様であれば交差している
    // 線分aに対して頂点がどちら側にあるのかは外積の符号で判定できる

    var a1 = edge[0];
    var a2 = edge[1];
    var b1 = line[0];
    var b2 = line[1];

    var tmp1 = cross(sub(a2,a1), sub(b1,a1)) * cross(sub(a2,a1), sub(b2,a1)) < -EPS;
    var tmp2 = cross(sub(b2,b1), sub(a1,b1)) * cross(sub(b2,b1), sub(a2,b1)) < -EPS;
    return tmp1 && tmp2;
}

function intersect_any(all_edges, line, sel_id){
    if(line == undefined){
        alert("line is undefined");
    }

    var line_char_id = char_ids[sel_id];
    for(var i = 0; i < all_edges.length; i++){
        // 異なる文字との間に元々ラインは引かれないためスキップ
        if(line_char_id != char_ids[i]){
            continue;
        }

        var sel_edges = all_edges[i];
        // alert("intersect with selection!");
        for(var j = 0; j < sel_edges.length; j++){
            if(intersect(sel_edges[j], line)){
                return true;
            }
        }
    }

    return false;
}

function calc_center(line){
    var pos1 = line[0];
    var pos2 = line[1];
    var center = [(pos1[0] + pos2[0])/2, (pos1[1] + pos2[1])/2];
    return center;
}

function is_in_text(all_edges, line, sel_id){
    // ラインがテキストの内部にあるかを判定する
    // ラインの中点から右上に線を伸ばし、
    // それがテキストのエッジと何度交差したかで内外判定を行う

    var center = calc_center(line);
    var right_point = [MAX, center[1] + MAX];
    var scanline = [center, right_point];

    if(scanline == undefined){
        alert("scanline is undefined");
    }

    var intersect_cnt = 0;

    var line_char_id = char_ids[sel_id];
    for(var i = 0; i < all_edges.length; i++){
        // 同じ文字内で無ければスキップ
        if(line_char_id != char_ids[i]){
            continue;
        }
        
        for(var j = 0; j < sel_edges.length; j++){
            if(intersect(sel_edges[j], scanline)){
                intersect_cnt++;
            }
        }
    }

    // 奇数回なら内部 偶数回なら外部
    return intersect_cnt%2 == 1;
}

//-----------------------selection bb---------------------------

function intersect_selections(pathitem1, pathitem2){
    // selection同士の交差判定
    // 2つのBBそれぞれの幅の合計よりも、2つを合わせた状態の幅の方が短い場合はx軸において交差している
    // さらに高さにおいても同様であれば2次元上で交差している
    // controlBounds: [x0, y0, x1, y1]

    var bb1 = pathitem1.controlBounds;
    var bb2 = pathitem2.controlBounds;

    var sum_w = Math.max(bb1[2], bb2[2]) - Math.min(bb1[0], bb2[0]);
    var sum_h = Math.max(bb1[1], bb2[1]) - Math.min(bb1[3], bb2[3]);

    var intersect_x = sum_w < (path_width(pathitem1) + path_width(pathitem2));
    var intersect_y = sum_h < (path_height(pathitem1) + path_height(pathitem2));

    return intersect_x && intersect_y;
}

function path_width(path){
    // CompoundPathはnoCompoundPathを実行した後は
    // widthとheightが適当な値になってしまうためBBから計算しなおす
    return path.controlBounds[2] - path.controlBounds[0];
}
function path_height(path){
    // CompoundPathはnoCompoundPathを実行した後
    // widthとheightが適当な値になってしまうためBBから計算しなおす
    return path.controlBounds[1] - path.controlBounds[3];
}


//-----------------------cost---------------------------
function calc_cost(sel_id, i, cur_sel_id, j){
    // スクリプトのメインとなるコスト関数
    // TODO: フォントによってウェイトを変更する。明朝体であれば距離コストを下げるなど
    // TODO: 文字種によってウェイトを変更する。ひらがなであれば斜めコストを下げるなど
    
    var cost = 0;

    base_points = sels[sel_id].pathPoints;
    base_pos = base_points[i].anchor;
    target_pos = sels[cur_sel_id].pathPoints[j].anchor;

    // * 隣接ポイント以外に進むコスト
    if(sel_id != cur_sel_id || j - i != 1){
        cost += cost_jump_point;
    }

    // * 距離コスト
    // セレクション全体の大きさを基準にする
    var standard_dist = Math.min(sels[sel_id].height, sels[sel_id].width);
    var dist = calc_distance(base_pos, target_pos);
    cost += weight_distance * (dist/standard_dist);

    // * 方向コスト
    // 前のポイントからの方向ベクトルを求める
    var prev_id = i-1;
    if(i == 0){
        prev_id = base_points.length - 1;
    }
    var dir_from_prev = dir(base_points[prev_id].anchor, base_pos);
    if(has_left_handle(base_points[i])){  // ハンドルを持っている場合はベクトルを変更
        var left_pos = base_points[i].leftDirection;
        dir_from_prev = dir(left_pos, base_pos);
    }
    // 後のポイントからの方向ベクトルを求める
    var next_id = i+1;
    if(i == base_points.length - 1){
        next_id = 1;
    }
    var dir_from_next = dir(base_points[next_id].anchor, base_pos);
    if(has_right_handle(base_points[i])){  // ハンドルを持っている場合はベクトルを変更
        var right_pos = base_points[i].rightDirection;
        dir_from_next = dir(right_pos, base_pos);
    }
    // target->baseの方向ベクトルが、前後からのベクトル(のより近い方)からどれだけずれているか
    var new_dir = dir(base_pos, target_pos);
    var max_dot = Math.max(dot(dir_from_prev, new_dir), dot(dir_from_next, new_dir));
    cost += weight_direction * (1 - max_dot);

    // * 斜めに進むコスト
    var theta_deg = Math.acos(dot(new_dir, X_AXIS)) * ( 180 / Math.PI );
    cost += weight_gradient * (theta_deg % 90) / 90;

    return cost;
}


//-----------------------main---------------------------

// 選択されているパスが元々どの字の一部であったかを調べておく
var char_ids = [];
for(var i=0; i<sels.length; i++){
    for(var j=0; j<pre_sels.length; j++){
        if(intersect_selections(sels[i], pre_sels[j])){
            char_ids.push(j);
            break;
        }
    }
}

// 各パスが含む辺を計算しておく
// all_edgesのインデックスはセレクションのインデックスと一致する
var all_edges = []
for(var sel_id = 0; sel_id < sels.length; sel_id++){

    points = sels[sel_id].pathPoints;
    sel_edges = [];

    for (var i = 0; i < points.length; i++){
        var edge;
        if(i == points.length-1){
            // 一番最後の点の次は点0となる
            edge = [points[i].anchor, points[0].anchor];
        }else{
            edge = [points[i].anchor, points[i+1].anchor];
        }
        sel_edges.push(edge);
    }
    all_edges.push(sel_edges);
}


// selection loop
// for(var sel_id = 3; sel_id < 4; sel_id++){
for(var sel_id = 0; sel_id < sels.length; sel_id++){
    points = sels[sel_id].pathPoints;

    // pathItemじゃない場合はpointsがundefined
    if(points == undefined){
        continue;
    }

    // point loop
    for (var pt_id = 0; pt_id < points.length; pt_id++) {
        // 全セレクションに対して探索
        var sorted_cost = [MAX];
        var sorted_sel_id = [-1];
        var sorted_pt_id = [-1];
        for(var cur_sel_id = 0; cur_sel_id < sels.length; cur_sel_id++){
            cur_points = sels[cur_sel_id].pathPoints;
            for(var cur_pt_id = 0; cur_pt_id < cur_points.length; cur_pt_id++){
                if(cur_sel_id == sel_id && cur_pt_id == pt_id){
                    continue;
                }

                // 元々同じ字のパーツでなければスキップする
                if(char_ids[sel_id] != char_ids[cur_sel_id]){
                    continue;
                }

                var cost = calc_cost(sel_id, pt_id, cur_sel_id, cur_pt_id);

                // TODO: 最大数を設定する
                for(var i = 0; 0 < sorted_cost.length; i++){
                    if(cost < sorted_cost[i]){
                        sorted_cost.splice(i, 0, cost);
                        sorted_sel_id.splice(i, 0, cur_sel_id);
                        sorted_pt_id.splice(i, 0, cur_pt_id);
                        break;
                    }
                }
            }
        }


        for(var line_id=0; line_id<sorted_cost.length; line_id++){
            
            if(sorted_cost[line_id] > sorted_cost[0]*threshold_second_line){
                break;
            }
            
            // テキストの辺であれば線をひかない
            var is_next = sorted_sel_id[line_id] == sel_id && sorted_pt_id[line_id] == pt_id+1;
            var is_prev = sorted_sel_id[line_id] == sel_id && sorted_pt_id[line_id] == pt_id-1;
            if(is_next || is_prev){
                continue;
            }

            // エッジを跨いでたら引かない
            var min_pos = sels[sorted_sel_id[line_id]].pathPoints[sorted_pt_id[line_id]].anchor;
            var line = [points[pt_id].anchor, min_pos];
            if(intersect_any(all_edges, line, sel_id)){
                continue;
            }

            // テキストの外部なら引かない
            if(!is_in_text(all_edges, line, sel_id)){
                continue;
            }

            add_line(points[pt_id].anchor, min_pos);
    
        }
    }
}

app.executeMenuCommand('group');
app.executeMenuCommand("Live Pathfinder Exclude");
app.executeMenuCommand('expandStyle');
app.executeMenuCommand('ungroup');
