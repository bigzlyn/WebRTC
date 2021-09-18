//信令服务器
'use strict'

//依赖库
var log4js = require("log4js");         //日志输出
var http = require("http");             //提供http服务
var https = require("https");           //提供https服务
var fs = require("fs");                 //用于读取文件内容

var socketIo = require("socket.io");        //npm install socket.io@2.0.3!!!!!!
var express = require("express");

var serveIndex = require("serve-index");

//一个房间可以同时在线最大用户数
var USERCOUNT = 3

//日志的配置项
log4js.configure(
    {
        appenders:{
            file:{
                type: 'file',
                filename: 'app.log',
                layout: {
                    type: 'pattern',
                    pattern: '%r %p - %m',
                }
            }
        },
        categories: {
            default: {
                appenders: ['file'],
                level: 'debug'
            }
        }    
    },
);

var logger  = log4js.getLogger();

var app = express();

//注意路由地址
app.use(serveIndex('./'));
app.use(express.static('./'));


// 设置跨域访问
app.all("*", function(req, res, next){

    res.writeHead(200,headers);

    //设置允许跨域的域名， *代表允许任意域名跨域
    res.header("Access-Control-Allow-Origin", "*");

    //允许的header类型
    res.header("Access-Control-Allow-Headers", "content-type");

    //跨域允许的请求方式
    res.header("Access-Control-Allow-Methods", "DELETE,PUT,GET,OPTIONS");

    console.log('====================================');
    if(req.method.toLocaleLowerCase() == 'options'){
        res.send(200);              //让options尝试请求快速结束
    }else{
        next();
    }
});

//HTTP服务
var http_server = http.createServer(app);
http_server.listen(8091,'127.0.0.1');

//你的网站证书
var options = {
    key: fs.readFileSync('/Users/lyn/Desktop/webRTC/ssl.key'),
    cert: fs.readFileSync('/Users/lyn/Desktop/webRTC/ssl.crt')
}


//HTTP
var https_server = https.createServer(options, app);

var io = socketIo.listen(https_server); //cors跨域


//处理连接事件
io.sockets.on('connection', (socket)=>{
    console.log("连接上了");

    //中转消息
    socket.on('message', (room, data)=>{
        logger.debug('message, room: ' + 'room' + ',data,type' + data.type);
        socket.to(room).emit('message',room,data);
    })

    //用户加入房间
    socket.on('join',(room)=>{
        socket.join(room);
        var myRoom = io.sockets.adapter.rooms[room];
        var users = (myRoom)?Object.keys(myRoom.sockets).length:0;
        logger.debug('the user number of room (' + room +') is:' + users);

        //如果房间里人未满
        if(users < USERCOUNT){
            //发给除自己之外的房间内所有人
            socket.emit('joined', room, socket.id);

            //通知另一个用户，有人来了
            if (users > 1){
                socket.to(room).emit('otherjoin', room, socket.id);
            }
        }else {//如果房间人满了
            socket.leave(room);
            socket.emit('full', room, socket.id);
        }
    })

    socket.on('leave', (room)=>{
        //从管理列表中将用户删除
        socket.leave(room);

        var myRoom = io.sockets.adapter.rooms[room];
        var users = (myRoom)?Object.keys(myRoom.sockets).length:0;

        logger.debug('this user number of room is:' + users);

        //通知其他用户有人离开了
        socket.to(room).emit('bye',room, socket.id);

        //通知用户服务器已处理
        socket.emit('leave',room, socket.id);
    })
});

https_server.listen(4434, '127.0.0.1');

console.log("没错");

