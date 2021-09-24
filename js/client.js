//客户端
'use strict'

//本地视频预览窗口
var localVideo = document.querySelector('video#localvideo');

//远端视频预览窗口
var remoteVideo = document.querySelector('video#remotevideo');

//连接信令服务端Button
var btnConn = document.querySelector('button#connserver');

//与信令服务器断开连接Buton
var btnLeave = document.querySelector('button#leave');

//查看Offerweb本窗口
var offer = document.querySelector('textarea#offer');

//查看Answer文本窗口
var answer = document.querySelector('textarea#answer');

var pcConfig={
    'iceServers':[{
        //TURN服务器地址
        'urls':'turn:xxx.avdancedu.com:3478',
        //TURN服务器用户名
        'username':'xxx',
        //TURN服务器密码
        'credential':'xxx'
    }],
    'iceTransportPolicy':'relay',
    'iceCandidatePoolSize':'0',
}

//本地视频流
var localStream = null;

//远端视频流
var remoteStream = null;

//PeerConnection
var pc = null;

//房间号
var roomid;
var socket = null;

//Offer描述
var offerdesc = null;

//状态机，初始值没init
var state = 'init';

/**
 * 功能：判断此浏览器是在PC端还是移动端
 * 
 * 返回值：false：移动端
 *        true：PC端
*/
function isPC(){
    var userAgentInfo = navigator.userAgent;
    var Agents = ['Android', 'iPhone', 'SysmbianOS', 'Windows Phone', 'iPad', 'iPod'];
    var flag = true;

    for (var v=0;v<Agents.length;v++){
        if(userAgentInfo.indexOf(Agents[v])>0){
            flag=false;
            break;
        }
    }

    return flag;
}

/**
 * iOS还是Android
*/
function isAndroid(){
    var u = navigator.userAgent;
    var app = navigator.appVersion;
    var isAndroid = u.indexOf('Android') > -1 || u.indexOf('Linux') > -1;
    var isIOS = !!u.match(/\(i[^;]+;(U;)? CPU.+Mac OS X/);
    if(isAndroid){
        return true;
    }
    if(isIOS){
        return false;
    }
}


/**
 * 功能：从url中获取指定域值
 * 返回值：指定域值或false
*/
function getQueryVariable(variable){
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for(var i=0;i<vars.length;i++){
        var pair = vars[i].split('=');
        if(pair[0]==variable){
            return pair[1];
        }
    }
    return false;
}

/**
 * 功能：向对端发消息
 * 返回值： 无
*/
function 
sendMessage(roomid, data) {
    console.log('send message to other end', roomid, data);
    if(! socket){
        console.log('socket is null');
    }
    socket.emit('message', roomid , data);
}


/**
 * 功能：与信令服务器建立socket.io连接；
 * 并根据信令更新状态
*/
function conn() {

    //连接信令服务器, //连接服务端，因为本机使用localhost 所以connect(url)中url可以不填或写 http://localhost
    socket = io.connect("https://127.0.0.1:4434");

    //'joined'消息处理函数
    socket.on('joined',(room, id)=>{
        console.log('receive joined message!',roomid, id);

        //更新状态'joined'
        state = 'joined';

        /**
         * 如果是Mesh方案，第一个人不该在这里创建
         * peerConnection，而是要等到所有端都收到一个'otherjoin'消息时再创建
        */

        //创建PeerConnection并绑定音视频轨
        createPeerConnection();
        bindTracks();

        //设置button状态
        btnConn.disable = true;
        btnLeave.disable = false;
        console.log('receive joined message, state = ',state);
    });

    //otherjoin消息处理函数
    socket.on('otherjoin',(roomid)=>{
        console.log('receive joined message:', roomid, state);

        //如果是多人，每加入一个人都要创建新的PeerConnection
        if(state==='joined_unbind'){
            createPeerConnection();
            bindTracks();
        }

        //状态机变更为joined_conn
        state = 'joined_conn';

        //开始'呼叫'对方
        call();

        console.log('receive other_join message, state=',state);
    });

    //full消息处理函数
    socket.on('full',(roomid, id)=>{
        console.log('receive full message', roomid, id);

        //关闭socket.io连接
        socket.disconnect();
        //挂断”呼叫“
        hangup();
        //关闭本地媒体
        closeLocalMedia();
        //状态机变更为leaved
        state='leaved';

        console.log('receive full message, state=', state);
        alert('the room is full!');
    });

    //leaved 消息处理函数
    socket.on('leaved',(roomid, id)=>{
        console.log('receive leaved message ', roomid, id);

        //状态机变更leaved
        state = 'leaved';
        //关闭socket.io连接
        socket.disconnect();
        console.log('receive leaved message state=',state);

        //改变button状态
        btnConn.disable = false;
        btnLeave.disconnect = true;
    });

    //bye 消息处理函数
    socket.on('bye', (room, id)=>{
        console.log('reveive bye message ', roomid, id);

        /**
         * 当Mesh方案时，应该带上当前房间的用户数，
         * 如果当前房间数不小于2，则不用修改状态，
         * 并且关闭应该是对应用户的PeerConnection
         * 在客户端应该维护一张PeerConnection表，
         * 它是key：value格式，key=userid，value=peerconnection
        */

        //状态机变更为joined_unbind
        state = 'joined_unbind';

        //挂断”呼叫“
        hangup();

        offer.value = '';
        answer.value = '';
        console.log('receive bye message. state=',state);
    });

    //socket.io连接断开处理函数
    socket.on('disconnect', (socket)=>{
        console.log('recieve disconnect message!', roomid);

        if(!(state === 'leaved')){
            //挂断”呼叫“
            hangup();
            //关闭本地媒体
            closeLocalMedia();

            //状态机变更为leaved
            state = 'leaved';
        }
    });

    //收到对端消息处理
    socket.on('message', (roomid, data)=>{
        console.log('receive message!', roomid, data);

        if(data===null||data===undefined){
            console.error('the message is invalid!');
            return
        }

        //如果收到SDP是Offer
        if(data.hasOwnProperty('type') && data.type === 'offer'){
            offer.value = data.sdp;

            //进行媒体协商
            pc.setRemoteDescription(new RTCSesstionDescription(data));

            //创建answer
            pc.createAnswer().then(getAnswer).catch(handleAnswerError);

            
        }else if(data.hasOwnProperty('type') && data.type == 'answer'){ 
            //如果收到SDP是Answer
            answer.value = data.sdp;
            //进行媒体协商
            pc.setRemoteDescription(new RTCSesstionDescription(data));

            
        }else if(data.hasOwnProperty('type') && data.type === 'candidate'){
            //如果收到的是Candidate
            var candidate = new RTCClceCandidate({
                sdpMLineIndex: data.label,
                candidate: data.candidate
            });

            //将远端Candidate消息添加到PeerConnection中
            pc.addIceCandidate(candidate);
        }else {
            console.log('the message is invalid!', data);
        }
    });

    //从url中获取roomid
    roomid = getQueryVariable('room');

    //发送'join'消息
    socket.emit('join', roomid);

    return true;
}

/**
 * 功能：打开音视频设备，并连接信令服务器
 * 
*/
function connSignalServer() {
    
    //开启本地视频
    start();

    return true;
}

/**
 * 功能：打开音视频成功时的回调函数
 * 
*/
function getMediaStream(stream) {
    
    //将从设备上获取到的音视频track添加到localStream中
    if(localStream){
        stream.getAudioTracks().forEach((track)=>{
            localStream.addTrack(track);
            stream.removeTrack(track);
        });
    }else {
        localStream = stream;
    }

    //本地视频标签与本地绑定
    localVideo.srcObject = localStream;

    /**
     * 调用conn()函数的位置特别重要,一定要在getMediaStream调用之后再调用,否则会出现绑定失败
    */

    //setup connection
    conn();
}

/**
 * 功能:错误处理函数
 * 
*/
function handleError(err) {
    console.log('Failed to get Media Stream!', err);
}

/**
 * 功能: 打开音视频设备
*/
function start() {
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
        console.error('the getUserMedia is not supported!');
        return;
    }else {
        var constrains;
        constrains = {
            video: true,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            }

        }

        //localhost, 127.0.0.1, https才可以调起摄像头和麦
        navigator.mediaDevices.getUserMedia(constrains)
            .then(getMediaStream)
            .catch(handleError);
    }
}

/**
 * 功能: 获得远端媒体流
*/
function getRemoteStream(e) {
    //存放远端视频流
    remoteStream = e.streams[0];

    //远端视频标签与远端视频流绑定
    remoteVideo.srcObject = e.streams[0];
}

/**
 * 功能: 处理Offer错误
 * 
*/
function handleOfferError(err) {
    console.error('Failed to create offer:', err);
}

/**
 * 处理Answer SDP描述符的回调函数
*/
function getAnswer(desc) {
    //设置Answer
    pc.setLocalDescription(desc);

    //将Answer显示出来
    answer.value = desc.sdp;

    //将Answer SDP发送给对端
    sendMessage(roomid, desc);
}


/**
 * 功能: 获取Offer SDP描述符的回调函数
*/
function getOffer(desc) {
    //设置Offer
    pc.setLocalDescription(desc);

    //将Offer显示出来
    offer.value = desc.sdp;
    offerdesc = desc;

    //将Offer SDP发送给对端
    sendMessage(roomid, offerdesc);
}

/**
 * 功能: 创建PeerConnection对象
*/
function createPeerConnection() {
    
    /**
     * 如果是多人的话,在这里要创建一个新的连接
     * 新创建好的要放到一个映射表中
    */
   //key = userid , value = peerconnection
   console.log('create RTCPeerConnection!');

   if(!pc){

        //创建PeerConnection对象
        pc = new RTCPeerConnection(pcConfig);

        //当收集到Candidate后
        pc.onicecandidate = (e)=>{
            if(e.candidate){
                console.log('candidate'+JSON.stringify(e.candidate.toJSON));
                //将Candidate发送给对端
                sendMessage(roomid, {
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            }else {
                console.log('this is the end candidate');
            }
        }

        /**
         * 当PeerConnection对象收到远端音视频流时
         * 触发ontrack事件
         * 并回调getRemoteStream函数
        */
       pc.ontrack = getRemoteStream;
   }
   else {
       console.log('the pc have be created!');
   }

   return;
}

/**
 * 功能: 将音视频track绑定在PeerConnection对象中
*/
function bindTracks() {
    console.log('bind tracks into RTCPeerConnection!');

    if(pc === null && localStream === undefined){
        console.log('pc is null or undefined');
        return;
    }

    if(localStream === null && localStream === undefined){
        console.error('localstream is null or undefined!');
        return;
    }

    //将本地音视频中所有的track添加到PeerConnection对象
    localStream.getTracks().forEach((track)=>{
        pc.addTrack(track, localStream);
    });

}

/**
 * 功能: 开启"呼叫"
*/
function call() {
    if(state === 'joined_conn'){
        var offerOption = {
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        }

        /**
         * 创建Offer,
         * 成功: 回调getOffer()方法
         * 失败: 回调handleOfferError()方法
        */

        pc.createOffer(offerOption)
            .then(getOffer)
            .catch(handleOfferError);
    }
}

/**
 * 功能: 挂断 "呼叫"
*/
function hangup() {
    if(!pc){
        return;
    }

    offerdesc = null;

    //将PeerConnection连接关掉
    pc.close();
    pc = null;
}

/**
 * 功能: 关闭本地媒体
*/
function closeLocalMedia() {
    if(!(localStream === null || localStream === undefined)){
        //遍历每个track,并将其关闭
        localStream.getTracks().forEach((track)=>{
            track.stop();
        });
    }
    localStream = null;
}

/**
 * 功能: 离开房间
*/
function leave() {
    //向信令服务器发送leave消息
    socket.emit('leave', roomid);

    //挂断"呼叫"
    hangup();

    //关闭本地媒体
    closeLocalMedia();

    offer.value = '';
    answer.value = '';

    btnConn.disable = false;
    btnLeave.disable = true;
}

//为Button设置单击事件
btnConn.onclick = connSignalServer;
btnLeave.onclick = leave;