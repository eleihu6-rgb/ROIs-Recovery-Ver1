
#include <vector>
#include <exception>
#include "UtilDbg.h"
#include <cstring>

using namespace std;


//----------------- dbg stack trace --------------------
#ifdef WIN32
#define MAX_STACK_SIZE 20
#define MAX_STACK_NAME_LEN 100
__declspec(thread) int g_dbg_stack_lock = 0;
__declspec(thread) int g_dbg_stack_size = 0;
__declspec(thread) char g_dbg_stack_track[MAX_STACK_SIZE * 2][MAX_STACK_NAME_LEN];
__declspec(thread) char g_dbg_stack_last[MAX_STACK_SIZE * 2][MAX_STACK_NAME_LEN];
#else
#define MAX_STACK_SIZE 20
#define MAX_STACK_NAME_LEN 100
#define _snprintf snprintf
thread_local int g_dbg_stack_lock = 0;
thread_local int g_dbg_stack_size = 0;
thread_local char g_dbg_stack_track[MAX_STACK_SIZE][MAX_STACK_NAME_LEN];
thread_local char g_dbg_stack_last[MAX_STACK_SIZE][MAX_STACK_NAME_LEN];
#endif


char* g_dbg_func = "";

//----------------- dbg stack trace --------------------


void dbg_stack_trace::init(const char* funcname) {

	//printf("dbg help  %s\n", funcname);
	if (g_dbg_stack_lock) {
		return;
	}
	if (g_dbg_stack_size >= MAX_STACK_SIZE) {
		//printf("dbg help buf is FULL!\n");
		this->name = 0;
		return;
	}
	else {
		for (int i = 0; i < MAX_STACK_SIZE-1; i++) {
			strncpy(g_dbg_stack_last[i + 1], g_dbg_stack_last[i], MAX_STACK_NAME_LEN - 1);
		}
		strncpy(g_dbg_stack_last[0], funcname, MAX_STACK_NAME_LEN - 1);

		strncpy(&g_dbg_stack_track[g_dbg_stack_size][0], funcname, MAX_STACK_NAME_LEN - 1);
		this->name = &g_dbg_stack_track[g_dbg_stack_size][0];
		g_dbg_stack_size++;
	}
}
dbg_stack_trace::dbg_stack_trace(string funcname) {
	init(funcname.c_str());
}

dbg_stack_trace::dbg_stack_trace(const char* funcname) {
	init(funcname);
}

//----------------- dbg stack trace --------------------
dbg_stack_trace::~dbg_stack_trace() {

	if (g_dbg_stack_lock) {
		return;
	}
	if (g_dbg_stack_size > MAX_STACK_SIZE) {
		this->name = 0;
		return;
	}
	if (g_dbg_stack_size <= 0) {
		return;
	}
	//for (int i = 0; i < msgCount; i++) {
		//printf("dbg help remove %s\n", &g_dbg_stack_track[g_dbg_stack_size - 1][0]);
		memset(&g_dbg_stack_track[g_dbg_stack_size - 1][0], 0, MAX_STACK_NAME_LEN);
		g_dbg_stack_size--;
	//}
}


void dbg_stack_trace::addMsg(std::string msg) {
	msgCount++;
	init(msg.c_str());
}

void dbg_stack_trace::addMsg(std::string msg, int num) {
	char buf[100] = { 0 };
	_snprintf(buf, sizeof(buf) - 1, "%s %d", msg.c_str(), num);
	init(buf);
}

void dbg_stack_trace::addMsg(std::string msg, std::string str) {
	char buf[100] = { 0 };
	_snprintf(buf, sizeof(buf) - 1, "%s %s", msg.c_str(), str.c_str());
	init(buf);
}
//----------------- dbg stack trace --------------------
void dbg_stack_trace::lockStackTrace() {
	printf("lockStackTrace() size=%d\n", g_dbg_stack_size);
	g_dbg_stack_lock = 1;
}
void dbg_stack_trace::printStackTrace() {
#ifdef DBG_HELP_STACK
	int i = 0;
	for (i = 0; i < MAX_STACK_SIZE; i++) {
		printf("printStackTrace: last[%d]=%s\n", i, g_dbg_stack_last[i]);
	}
	printf("printStackTrace: dbg_stack_size=%d\n", g_dbg_stack_size);
	for (i = 0; i < g_dbg_stack_size; i++) {
		printf("   %s()\n", &g_dbg_stack_track[i][0]);
	}
#endif
}

