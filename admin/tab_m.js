//Settings
var socket = io.connect('/', {path: '/socket.io'});

// console.log("****************** TEST ********************");
// console.log("************ href  = " + window.location.href)
AddCams();

function asyncEmit(eventName, data1, data2 = "") {
    return new Promise(function (resolve, reject) {
        if (data2 !== "")
            socket.emit(eventName, data1, data2, function (err, result) {
                if(!err && result)
                    resolve(result)
                else
                    reject(err)
            })
        else
            socket.emit(eventName, data1, function (err, result) {
                if(!err && result)
                    resolve(result)
                else
                    reject(err)
            })
    })
  }

async function AddCams() {
    
    const devs = await asyncEmit('getForeignObjects', 'ring.0.cocoa*', 'device')
    .then((result) => { return result })
    .catch((error) => { console.log(error); return })
    // console.log("Devices: " + JSON.stringify(devs))

    let cam = 0
    let x = ""
    // for(let x=0; x<3; x++)  // for testing
    for(const dev_prop in devs) {
        const camera = devs[dev_prop].common.name.split('("').pop().slice(0, -2)
        let elem = document.getElementById('camera ' + cam)
        cam++
        elem.outerHTML +=
            '<div id="camera ' + cam + '" class="row" style="padding: 2px;">' +
                '<string class="col s12 title center" style="padding: 5px; background-color:#174475; font-size: 1.9rem; border-radius: 4px">' + camera + x + '</string>' +
            '</div>'
        elem = document.getElementById('camera ' + cam)
        const media = await asyncEmit('getStates', devs[dev_prop]._id + '.*.url')
        .then((result) => { return result })
        .catch((error) => { console.log(error); return })
        for(const media_prop in media) {
            const title = media[media_prop].val.split('_').pop().split('.')[0]
            const type = media[media_prop].val.split('_').pop().split('.')[1]
            elem.innerHTML +=
                '<div class="col s12 m12 l4">' +
                    '<h5 class="center blue-text text-darken-2">' + title + x + '</h5>' +
                    '<a href="#' + title + '">' +
                        (type === "jpg" ? 
                        '<img src="' + media[media_prop].val +'" alt="' + title + x + '" width="100%">' :
                        '<video controls="true" width="100%" alt="' + title + '">' + 
                        '<source src="' + media[media_prop].val +'" type="video/mp4"/>' +  
                        '</video>') +
                    '</a\>' +
                '</div\>'
        }
    }

    /*
    socket.emit('getForeignObjects', 'ring.0.cocoa*', 'device', function (err, result) {
        if(!err && result) {
            let cam = 0
            for(let x=0; x<2; x++)
            for(const prop in result) {
                const dev = result[prop].common.name.split('("').pop().slice(0, -2)
                let elem = document.getElementById('camera ' + cam)
                cam++
                elem.outerHTML +=
                    '<div id="camera ' + cam + '" class="row" style="padding: 2px;">' +
                        '<string class="col s12 title center" style="padding: 5px; background-color:#174475; font-size: 1.9rem; border-radius: 4px">' + dev + '</string>' +
                    '</div>'
                console.log("*******Title added ******** " + dev + ", cam " + cam)
                socket.emit('getStates', result[prop]._id + '.*.url', function (err, result) {
                    if(!err && result) {
                        // console.log(JSON.stringify(result))
                        elem = document.getElementById('camera ' + cam)
                        console.log("*******Output will be added to ******** cam " + cam + ", x= " + x)
                        for(const prop in result) {
                            const title = result[prop].val.split('_').pop().split('.')[0]
                            const type = result[prop].val.split('_').pop().split('.')[1]
                            elem.innerHTML +=
                                '<div class="col s12 m12 l4">' +
                                    '<h5 class="center blue-text text-darken-2">' + title + '</h5>' +
                                    '<a href="#' + title + '">' +
                                        (type === "jpg" ? 
                                        '<img src="' + result[prop].val +'" alt="' + title + '" width="100%">' :
                                        '<video controls="true" width="100%" alt="' + title + '">' + 
                                        '<source src="' + result[prop].val +'" type="video/mp4"/>' +  
                                        '</video>') +
                                    '</a\>' +
                                '</div\>'
                            console.log("*******Output added ******** " + title + ", cam " + cam)
                        }
                    }
                })
            }
        }
    })
    */
}