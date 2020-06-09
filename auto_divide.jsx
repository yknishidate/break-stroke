app.executeMenuCommand("outline");
app.executeMenuCommand('ungroup');
app.executeMenuCommand("noCompoundPath");

doc = app.activeDocument;
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

// 基本的には最小コストのラインを1本引くが、2番目にコストが小さい
// ラインが十分最小コストに近い場合は2本目を引いてよい
// この時の「十分に近い」を判定するための閾値
threshold_second_line = 1.3;

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

function intersect_any(all_edges, line){
    if(line == undefined){
        alert("line is undefined");
    }
    // TODO: セレクションのバウンディングボックス事前交差判定で高速化する
    for(var i = 0; i < all_edges.length; i++){
        if(intersect(all_edges[i], line)){
            return true;
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

function is_in_text(all_edges, line){
    // ラインがテキストの内部にあるかを判定する
    // ラインの中点から右上45度に線を伸ばし、
    // それがテキストのエッジと何度交差したかで内外判定を行う

    var center = calc_center(line);
    var right_point = [MAX, center[1] + MAX];
    var scanline = [center, right_point];

    if(scanline == undefined){
        alert("scanline is undefined");
    }

    var intersect_cnt = 0;
    // TODO: セレクションのバウンディングボックス事前交差判定で高速化する
    for(var i = 0; i < all_edges.length; i++){
        if(intersect(all_edges[i], scanline)){
            intersect_cnt++;
        }
    }

    // 奇数回なら内部 偶数回なら外部
    return intersect_cnt%2 == 1;
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

    
    // 隣接ポイント以外に進むコスト
    if(sel_id != cur_sel_id || j - i != 1){
        cost += cost_jump_point;
    }


    // 距離コスト
    // 何かしらで正規化が必要 -> 隣接する辺でより短い方を基準値とする
    var dist_to_next = calc_distance(base_pos, base_points[i+1].anchor);
    var dist_to_prev = calc_distance(base_pos, base_points[i-1].anchor);
    var dist_for_norm = Math.min(dist_to_next, dist_to_prev);

    var dist = calc_distance(base_pos, target_pos);
    cost += weight_distance * (dist/dist_for_norm);
    

    // 方向コスト
    // ポイントの左右の方向ベクトルを計算
    var dir_from_prev = dir(base_points[i-1].anchor, base_pos);
    if(has_left_handle(base_points[i])){  // ハンドルを持っている場合はベクトルを変更
        var left_pos = base_points[i].leftDirection;
        dir_from_prev = dir(left_pos, base_pos);
    }
    var dir_from_next = dir(base_points[i+1].anchor, base_pos);
    if(has_right_handle(base_points[i])){  // ハンドルを持っている場合はベクトルを変更
        var right_pos = base_points[i].rightDirection;
        dir_from_next = dir(right_pos, base_pos);
    }
    // target->baseのベクトルが左右(のより近い方)からどれだけずれているか
    var new_dir = dir(base_pos, target_pos);
    cost += weight_direction * (1 - Math.max(dot(dir_from_prev, new_dir), dot(dir_from_next, new_dir)));


    // 斜めに進むコスト
    var theta_deg = Math.acos(dot(new_dir, X_AXIS)) * ( 180 / Math.PI );
    cost += weight_gradient * (theta_deg % 90) / 90;


    return cost;
}


//-----------------------main---------------------------
// 選択されたテキストが含む全ての辺を計算しておく
// TODO: 高速化のためにセレクションとそれが含むポイントの2次元配列にする
var all_edges = []
for(var sel_id = 0; sel_id < sels.length; sel_id++){
    points = sels[sel_id].pathPoints;
    for (var i = 0; i < points.length; i++){
        var edge;
        if(i == points.length-1){
            edge = [points[i].anchor, points[0].anchor];
        }else{
            edge = [points[i].anchor, points[i+1].anchor];
        }
        all_edges.push(edge);
    }
}
if(all_edges.length > 300){
    alert("This process takes a long time!");
}


// selection loop
for(var sel_id = 0; sel_id < sels.length; sel_id++){
    points = sels[sel_id].pathPoints;

    // pathItemじゃない場合はpointsがundefined
    if(points == undefined){
        continue;
    }

    // point loop
    for (var pt_id = 0; pt_id < points.length; pt_id++) {
        // 最初と最後のポイントは無視
        // TODO: ここ対応する
        if(pt_id == 0 || pt_id == points.length-1){
            continue;
        }

        // 全セレクションに対して探索
        var min_cost = MAX;
        var min_sel_id = [-1, -1];
        var min_pt_id = [-1, -1];
        for(var cur_sel_id = 0; cur_sel_id < sels.length; cur_sel_id++){
            cur_points = sels[cur_sel_id].pathPoints;
            for(var cur_pt_id = 0; cur_pt_id < cur_points.length; cur_pt_id++){
                if(cur_sel_id == sel_id && cur_pt_id == pt_id){
                    continue;
                }

                var cost = calc_cost(sel_id, pt_id, cur_sel_id, cur_pt_id);

                if(cost < min_cost){
                    // それまでの最小コストが新しい最小コストとあまり変わらなければ2番目として取っておく
                    if(min_cost < cost*threshold_second_line){
                        // 0->1にずらす(2番目に小さい)
                        min_sel_id[1] = min_sel_id[0];
                        min_pt_id[1] = min_pt_id[0];
                    }
                    // 最小コストから十分離れていれば捨てる
                    else{
                        min_sel_id[1] = -1;
                        min_pt_id[1] = -1;
                    }

                    min_cost = cost;

                    // 最小コストのインデックスを更新
                    min_sel_id[0] = cur_sel_id;
                    min_pt_id[0] = cur_pt_id;
                }
            }
        }

        // 最小コストラインを追加する(最大2本まで)
        for(var line_id=0; line_id<2; line_id++){
            // データが捨てられている場合は無視
            if(min_sel_id[line_id] == -1 || min_pt_id[line_id] == -1){
                continue;
            }

            // テキストの辺であれば線をひかない
            var is_next = min_sel_id[line_id] == sel_id && min_pt_id[line_id] == pt_id+1;
            var is_prev = min_sel_id[line_id] == sel_id && min_pt_id[line_id] == pt_id-1;
            if(is_next || is_prev){
                continue;
            }

            // エッジを跨いでたら引かない
            var min_pos = sels[min_sel_id[line_id]].pathPoints[min_pt_id[line_id]].anchor;
            var line = [points[pt_id].anchor, min_pos];
            if(intersect_any(all_edges, line)){
                continue;
            }

            // テキストの外部なら引かない
            if(!is_in_text(all_edges, line)){
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

// alert("end");