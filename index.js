
//报错处理
function handleError(error){
    console.log("err",error);
}

//获取设备列表回调
function gotDevice(deviceInfos){
    for (let i=0;i<deviceInfos.length;i++){
        const deviceInfo = deviceInfos[i];
        console.log(deviceInfo);
    }
    
}

//遍历音视频设备信息
navigator.mediaDevices.enumerateDevices()
    .then(gotDevice)
    .catch(handleError)


//从设备选项栏里选择某个设备
var deviceId = "";
var groupId = ""

var constrains = {
    video: {
        width: 640,
        height: 480,
        frameRate: 15,
        facingMode: 'enviroment',
        // deviceId: deviceId?{exact:deviceId}:undefined
        // groupId: groupId?{exact:groupId}:undefined,
    },
    // video: true,
    audio: true,
}

//获取video标签
const lv = document.querySelector('video');

//调用getUserMedia成功后，采集到某路流，回调函数
function gotLocalStream(mediaStream){
    //看下track
    var tracks = mediaStream.getTracks();
    console.log(tracks);
    
    lv.srcObject = mediaStream;
}

navigator.mediaDevices.getUserMedia(constrains)
    .then(gotLocalStream)
    .catch(handleError)
