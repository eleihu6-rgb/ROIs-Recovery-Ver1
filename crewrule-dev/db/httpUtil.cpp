#include "httpUtil.h"
#include "mongoose.h"
#include "ErrorCodeDef.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

using namespace std;

extern "C"
struct mg_connection *mg_connect_http_base(
	struct mg_mgr *mgr, mg_event_handler_t ev_handler,
	struct mg_connect_opts opts, const char *schema, const char *schema_ssl,
	const char *url, const char **path, char **user, char **pass, char **addr);

int readFileWithAlloc(const char* filepath, char** pBuf, int* pSize);

//利用 mongoose 发送 http post请求
struct mg_connection * mg_connect_http_post(struct mg_mgr *mgr, mg_event_handler_t ev_handler, const char *url, const char* token, const char * contentType, const char * buf, int bufLen);

struct http_client_ctx {
	char name[20];
	FILE * recvFile;
	char * recvBuf;  //recvFile/ recvBuf 二选一
	std::size_t recvBufMaxSize;
	std::size_t recvSize;
	char url[1024];
	int s_exit_flag;
};

static void ev_handler(struct mg_connection *nc, int ev, void *ev_data) {
	struct http_client_ctx * ctx = NULL;// (struct http_client_ctx*)nc->mgr->user_data;
	struct http_message *hm = (struct http_message *) ev_data;
	int connect_status;

	switch (ev) {
	case MG_EV_CONNECT:
		connect_status = *(int *)ev_data;
		if (connect_status != 0) {
			ctx = (struct http_client_ctx*)nc->mgr->user_data;
			Logger::getRuleLogger()->info("Error connecting to {}: {}", ctx->url, strerror(connect_status));
			ctx->s_exit_flag = 1;
		}
		break;
	case MG_EV_HTTP_REPLY:
		Logger::getRuleLogger()->info("event reply");
		//printf("Got reply:\n%.*s\n", (int) hm->body.len, hm->body.p);
		Logger::getRuleLogger()->info("Got reply:\n{}", (int)hm->body.len);
		ctx = (struct http_client_ctx*)nc->mgr->user_data;
		if (ctx->recvFile) {
			fwrite(hm->body.p, hm->body.len, 1, ctx->recvFile);
		}
		else {
			if (ctx->recvSize + (int)hm->body.len <= ctx->recvBufMaxSize)
				memcpy(ctx->recvBuf + ctx->recvSize, hm->body.p, hm->body.len);
			else
				Logger::getRuleLogger()->error("NOT enough BUF for http response");
		}
		ctx->recvSize += hm->body.len;
		nc->flags |= MG_F_SEND_AND_CLOSE;
		ctx->s_exit_flag = 1;
		break;
	case MG_EV_CLOSE:
		Logger::getRuleLogger()->info("event close");
		ctx = (struct http_client_ctx*)nc->mgr->user_data;
		if (ctx->s_exit_flag == 0) {
			Logger::getRuleLogger()->info("Server closed connection");
			ctx->s_exit_flag = 1;
		};
		break;
	default:
		//Logger::getRuleLogger()->info("HTTP EVENT {}", ev);
		break;
	}
}

static void ev_handler_http(string httpResponse) {
	string token = "\"message\":";
	std::size_t index = httpResponse.find(token);
	std::size_t index2 = httpResponse.find(",", index);
	if (index == string::npos || index2 == string::npos) {
		return;
	}
	string exceptMsg = httpResponse.substr(index + token.length(), index2);
	Logger::getRuleLogger()->info("http response: {} ",
		(exceptMsg.length() > 0 ? exceptMsg.c_str() : httpResponse.c_str()));
}


//读取文件
//* malloc动态分配内存，需要调用者主动释放
//* 参数 buf/len为指针，作为读取结果OUT型参数
int readFileWithAlloc(const char* filepath, char** pBuf, int* pSize) {
	FILE * fp = 0;
	fp = fopen(filepath, "rb");
	if (!fp) {
		return ERR_FILE_OPEN_FAIL;
	}
	fseek(fp, 0, SEEK_END);
	*pSize = ftell(fp);
	rewind(fp);
	*pBuf = (char*)malloc(*pSize + 1);
	if (*pBuf == NULL) {
		fclose(fp);
		return ERR_OUT_OF_MEM;
	}
	memset(*pBuf, 0, *pSize + 1);
	fread(*pBuf, 1, *pSize, fp);
	fclose(fp);
	fp = NULL;
	return 0;
}

//硬盘文件接收recv
int sendHttpReq(string url, string& tokenStr, const char * contentType, char* inputBuf, int inputLen, const char* outputFile) {
	int ret = 0;
	char msg[1024] = { 0 };
	FILE * fp = NULL;
	string formattedUrl;
	struct mg_mgr mgr;
	struct mg_connection * nc = NULL;
	struct http_client_ctx ctx = { 0 };
	const char * token = NULL;

	//http请求
	formattedUrl = url;
	if (strToLower(url).find("localhost:") != -1) {
		std::size_t startIndex = strToLower(url).find("localhost:");
		if (startIndex != string::npos) {
			formattedUrl = url.replace(startIndex, strlen("localhost"), "127.0.0.1");
		}
	}
	strncpy(ctx.url, formattedUrl.c_str(), sizeof(ctx.url));
	strncpy(ctx.name, "http_client_ctx", sizeof(ctx.name));
	ctx.recvSize = 0;
	ctx.recvFile = fopen(outputFile, "w+b");
	if (ctx.recvFile == NULL) {
		Logger::getRuleLogger()->error("ERROR: fopen fail");
	}

	mg_mgr_init(&mgr, &ctx);
	strncpy(ctx.name, "http_client_ctx", sizeof(ctx.name));
	token = tokenStr.length() > 0 ? tokenStr.c_str() : NULL;
	nc = mg_connect_http_post(&mgr, ev_handler, url.c_str(), token, contentType, inputBuf, inputLen); //自定义接口，以便支持 post发送 binary数据
	mg_set_protocol_http_websocket(nc);

	Logger::getRuleLogger()->info("Starting RESTful client against {}", url.c_str());
	int count = 0;
	int MAX_TIMEOUT_SECOND = 600;//timeout seconds
	time_t timeoutUtc = time(0) + MAX_TIMEOUT_SECOND;
	std::size_t lastRecvSize = 0;
	while (ctx.s_exit_flag == 0) {
		mg_mgr_poll(&mgr, 1000);
		count++;
		if (count % 10000 == 9999) fprintf(stdout, ".");
		//timeout
		if (lastRecvSize != ctx.recvSize) {
			lastRecvSize = ctx.recvSize;
			timeoutUtc = time(0) + MAX_TIMEOUT_SECOND;
		}
		else {
			if (time(0) >= timeoutUtc) {
				Logger::getRuleLogger()->error("ERROR: recv http timeout(%ds)", MAX_TIMEOUT_SECOND);
				//20180827 ain, mantis#3902, timeout后返回 ERR_TIME_OUT
				ret = ERR_TIME_OUT;
				break;
			}
		}
	}
	mg_mgr_free(&mgr);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}

	Logger::getRuleLogger()->info("total recv size: {}", ctx.recvSize);
	fclose(ctx.recvFile);
	ctx.recvFile = NULL;
	Logger::getRuleLogger()->info("end");

	//http response
	ctx.recvFile = fopen(outputFile, "r");
	fread(msg, 1, sizeof(msg), ctx.recvFile);
	fclose(ctx.recvFile);
	ctx.recvFile = 0;
	Logger::getRuleLogger()->info("s_exit_flag={}", ctx.s_exit_flag);
	if (strnlen(msg, sizeof(msg)) == 0 && ctx.s_exit_flag == 0)                        // no respones
		Logger::getRuleLogger()->info("http server no response, possible reason is server not start");
	else if (strnlen(msg, sizeof(msg)) < 20 && 0 == atoi(msg)) //response is error code number
		Logger::getRuleLogger()->info("http response: 00 (success)");
	else
		ev_handler_http(msg);

CLEANUP:
	if (ret != 0) {
		//print error msg from http server 
		char msg[1024] = { 0 };
		ctx.recvFile = fopen(outputFile, "r");
		fread(msg, 1, sizeof(msg), ctx.recvFile);
		fclose(ctx.recvFile);
		if (strnlen(msg, sizeof(msg)) == 0)                        // no respones
			Logger::getRuleLogger()->info("http server no response, possible reason is server not start");
		else if (strnlen(msg, sizeof(msg)) < 20 && 0 == atoi(msg)) // response is error code number
			Logger::getRuleLogger()->info("http response: 00 (success)");
		else {
			ev_handler_http(msg);
		}
	}
	if (fp) fclose(fp); fp = NULL;
	return ret;
}

//内存缓冲接收recv
int sendHttpReq2(string url, string& tokenStr, const char * contentType, char* inputBuf, int inputLen, char* outputBuf, int& outputLen) {
	int ret = 0;
	string formattedUrl;
	const char * token = NULL;
	struct mg_mgr mgr;
	struct mg_connection * nc = NULL;
	struct http_client_ctx ctx = { 0 };

	//http请求
	formattedUrl = url;
	if (strToLower(url).find("localhost:") != -1) {
		std::size_t startIndex = strToLower(url).find("localhost:");
		if (startIndex != string::npos) {
			formattedUrl = url.replace(startIndex, strlen("localhost"), "127.0.0.1");
		}
	}
	strncpy(ctx.url, formattedUrl.c_str(), sizeof(ctx.url));
	strncpy(ctx.name, "http_client_ctx", sizeof(ctx.name));
	ctx.recvFile = NULL;
	ctx.recvBuf = outputBuf;
	ctx.recvBufMaxSize = (outputLen <= 0) ? 0 : (outputLen - 1);
	ctx.recvSize = 0;

	//send http
	mg_mgr_init(&mgr, &ctx);
	strncpy(ctx.name, "http_client_ctx", sizeof(ctx.name));
	token = tokenStr.length() > 0 ? tokenStr.c_str() : NULL;
	nc = mg_connect_http_post(&mgr, ev_handler, url.c_str(), token, contentType, inputBuf, inputLen); //自定义接口，以便支持 post发送 binary数据
	mg_set_protocol_http_websocket(nc);

	//wait
	Logger::getRuleLogger()->info("Starting RESTful client against {}", url.c_str());
	int count = 0;
	int MAX_TIMEOUT_SECOND = 600; //timeout seconds
	time_t timeoutUtc = time(0) + MAX_TIMEOUT_SECOND;
	std::size_t lastRecvSize = 0;
	while (ctx.s_exit_flag == 0) {
		mg_mgr_poll(&mgr, 1000);
		count++;
		if (count % 20 == 19) fprintf(stdout, ".");
		//timeout
		if (lastRecvSize != ctx.recvSize) {
			lastRecvSize = ctx.recvSize;
			timeoutUtc = time(0) + MAX_TIMEOUT_SECOND;
		}
		else {
			if (time(0) >= timeoutUtc) {
				Logger::getRuleLogger()->error("ERROR: recv http timeout({}s)", MAX_TIMEOUT_SECOND);
				//20180827 ain, mantis#3902, timeout后返回 ERR_TIME_OUT
				ret = ERR_TIME_OUT;
				break;
			}
		}
	}
	mg_mgr_free(&mgr);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}

	//http response
	outputLen = (int)ctx.recvSize;
	Logger::getRuleLogger()->info("http response len {}", outputLen);

CLEANUP:
	if (ret != 0) {
		Logger::getRuleLogger()->info("http-recv: {}, {}", url.c_str(), outputBuf);
	}
	return ret;
}


//利用 mongoose 发送 http post请求
//自定义接口，以便支持
struct mg_connection * mg_connect_http_post(struct mg_mgr *mgr, mg_event_handler_t ev_handler, const char *url, const char* token, const char * contentType, const char * buf, int bufLen) {
	char * postBuf = 0;
	int postLen = 0;
	int postBufSize = 0;
	int headerLen = 0;
	struct mg_connect_opts opts = { 0 };
	char *user = NULL, *pass = NULL, *addr = NULL;
	const char *path = NULL;
	struct mbuf auth;
	struct mg_connection *nc = NULL;

#if MG_ENABLE_SSL
	memset(&opts, 0, sizeof(opts));  // 初始化 opts 结构体
	opts.ssl_cert = NULL;  // 不设置 SSL 证书
	opts.ssl_ca_cert = "*";  // 忽略证书验证
#endif

	//mongoose init =
	nc = mg_connect_http_base(mgr, ev_handler, opts, "http://", "https://", url,
		&path, &user, &pass, &addr);

	if (nc == NULL) {
		return NULL;
	}
	mbuf_init(&auth, 0);
	if (user != NULL) {
		mg_basic_auth_header(user, pass, &auth);
	}

	//make http packet
	postBufSize = bufLen + 4096;
	postBuf = (char*)malloc(postBufSize);
	memset(postBuf, 0, postBufSize);
	headerLen = snprintf(postBuf, postBufSize - 1,
		"POST %s HTTP/1.1\r\n"                                    //path
		"Content-Length: %d\r\n"                                  //post data len
		"Content-Type: %s\r\n"
		"Host: %s\r\n"                                            //addr
		"Connection: Keep-Alive\r\n"
		"User-Agent: Apache-HttpClient/4.5.2 (Java/1.8.0_111)\r\n"
		"Flag: Rule\r\n"
		"Accept-Encoding: gzip,deflate\r\n"
		"Authorization: Bearer %s\r\n"
		"\r\n",
		path, bufLen, contentType, addr,
		//default token: user=ROIS exp after 9999-12-31
		token != NULL ? token : "eyJhbGciOiJIUzI1NiJ9.eyIwIjoxLCJpc3MiOiJhZG1pbkBwaS1zb2x1dGlvbiIsImV4cCI6MzE3MDYxNDgxMjA4LCJ1c2VyTmFtZSI6IlJPSVMifQ.5G6Vb2w38isZCo_Q6ZvgefLAk49ub928nUWlSj3rR-o"); // never exp
	memcpy(postBuf + headerLen, buf, bufLen); //post data buf
	postLen = headerLen + bufLen;

	//log
	Logger::getRuleLogger()->info("http post: {}", postBuf);

	//http send
	mg_send(nc, postBuf, postLen);

	//free memory
	mbuf_free(&auth);
	free(postBuf); postBuf = NULL;
	free(user);
	free(pass);
	free(addr);
	return nc;
}