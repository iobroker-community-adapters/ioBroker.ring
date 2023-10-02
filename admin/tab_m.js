"use strict";

// var socket = io.connect('/', {path: '/socket.io'})   // not needed, via adapter-settings

AddCams()

function asyncEmit(command, data1 = "", data2 = "") {
    return new Promise(function (resolve, reject) {
        if (data2 !== "")
            socket.emit(command, data1, data2, function (err, result) {
                if (!err && result)
                    resolve(result);
                else
                    reject(err);
            });
        else
            socket.emit(command, data1, function (err, result) {
                if (!err && result)
                    resolve(result);
                else
                    reject(err);
            });
    });
}

async function AddCams() {
    const devs = await asyncEmit("getForeignObjects", "ring." + instance + ".cocoa*", "device")
        .then((result) => { return result; })
        .catch((error) => { console.log(error); return; });
    // console.log("Devices: " + JSON.stringify(devs))
    let cam = 0;
    // eslint-disable-next-line prefer-const
    for (const dev_prop in devs) {
        const dev = dev_prop.split(".").pop() // device name
        const camera = devs[dev_prop].common.name.split('("').pop().slice(0, -2);
        let elem = document.getElementById("camera " + cam);
        cam++;
        elem.outerHTML +=
            '<div id="camera ' + cam + '" class="row" style="padding: 2px;">' +
                '<string class="col s12 title center" style="padding: 5px; background-color:#174475; font-size: 1.9rem; border-radius: 4px">' + camera + "</string>" +
            "</div>";
        elem = document.getElementById("camera " + cam);
        
        const files = await asyncEmit("readDir", "ring." + instance, dev)
            .then((result) => { return result; })
            .catch((error) => { console.log(error); return; });
        const sn= files.filter(e=>!e.file.includes("HDsnapshot") &&  e.file.slice(-3) === "jpg").map(a=>a.file)
        const hd= files.filter(e=> e.file.includes("HDsnapshot") &&  e.file.slice(-3) === "jpg").map(a=>a.file)
        const mv= files.filter(e=>e.file.slice(-3) === "mp4").map(a=>a.file)    

        const media = await asyncEmit("getStates", devs[dev_prop]._id + ".*.url")
            .then((result) => { return result; })
            .catch((error) => { console.log(error); return; });
        for (const media_prop in media) {
            const title = media[media_prop].val.split("_").pop().split(".")[0];
            const type = media[media_prop].val.split("_").pop().split(".")[1];
            const med = document.createElement("div")
            med.className = "col s12 m12 l4"
            med.innerHTML =   '<h5 class="translate center blue-text text-darken-2">' + title + '</h5>' +
                                '<a href="#' + title + '">' +
                                    (type === "jpg" ?
                                    '<img id="#media_' + dev + '_' + title + '" src="' + media[media_prop].val + '" onclick="this.requestFullscreen()" alt="' + title + '" width="100%">' :
                                    '<video id="#media_' + dev + '_' + title + '" controls="true" width="100%" alt="' + title + '">' +
                                        '<source src="' + media[media_prop].val + '" type="video/mp4"/>' +
                                    '</video>') +
                                '</a>'
            let ml
            if (type === "jpg") {
                if (title === "Snapshot")
                    ml = sn
                else
                    ml = hd
            } else
                ml = mv
            if (ml.length > 0) {
                // check if ts is included in first filename
                try {
                    const test = new Date(Number(ml[0].split("_").pop(0).split(".")[0])).toLocaleString()
                } catch (e) {
                    console.log("Filename has no timestamp")
                    elem.appendChild(med)
                    continue
                }

                const inp = document.createElement("div")
                inp.className = 'input-field col s12 m12 l6'

                const sel = document.createElement("select")
                sel.id = "#inp" + title
                sel.className = 'value'
                
                for (const e of ml)
                    sel.options.add(new Option(new Date(Number(e.split("_").pop(0).split(".")[0])).toLocaleString(), e))

                sel.addEventListener("change", (event)=>{
                    // console.log("********* Event with id " + "#inp" + title + " fired: " + event.target.value + ", device = " + dev)
                    const media = document.getElementById("#media_" + dev + '_' + title)
                    media.setAttribute("src", 'http://' + location.hostname + ':8082/ring.' + instance + '/' + dev + '/' + event.target.value)
                    if (type === "mp4") {
                        media.load()
                        media.play()
                    }
                })
                inp.appendChild(sel)
                med.appendChild(inp)
            }
            elem.appendChild(med)
        }
    }
    // re-init materialize Events
    var elems = document.querySelectorAll('select')
    var instances = M.FormSelect.init(elems)
    translateAll()
}

// http://dev-ring-ioBrocker-Dev:8082/ring.0/ring_0_cocoa_308343825_HDSnapshot.jpg
// /opt/iobroker/iobroker-data/files/ring.0/cocoa_308343825/HDsnapshot308343825_1696092057994.jpg