/*
说明：
1 用于帮助定位错误。
进入每个函数后，执行 dbg_stack_push(func_name)
退出每个函数前，执行 dbg_stack_pop(func_name)
2 捕获到异常时执行 dbg_stack_print()
*/
#ifndef UTIL_DBG_H
#define UTIL_DBG_H
#include <string>

//开关：是否打开 DBG_HELP功能
//#define DBG_HELP_STACK 
#ifdef DBG_HELP_STACK
#define DBG_HELP(name) dbg_stack_trace dbgHelp(name)
#define DBG_HELP2(var,name) dbg_stack_trace var(name)
#define DBG_HELP3(msg) dbgHelp.addMsg(msg)
#define DBG_HELP4(msg,num) dbgHelp.addMsg(msg,num)
#define DBG_HELP5(msg,str) dbgHelp.addMsg(msg,str)
#else
#define DBG_HELP(name) 
#define DBG_HELP2(var,name) 
#define DBG_HELP3(msg) 
#define DBG_HELP4(msg,num) 
#define DBG_HELP5(msg,str) 
#endif
#ifdef PRINT_STACK
#define DBG_HELP(name) printf("stack:%s\n",name)
#endif

class dbg_stack_trace {
public:
	dbg_stack_trace(const char* funcname);
	dbg_stack_trace(std::string funcname);
	~dbg_stack_trace();

	void addMsg(std::string msg);
	void addMsg(std::string msg, int num);
	void addMsg(std::string msg, std::string str);
	static void lockStackTrace();
	static void printStackTrace();
private:
	void init(const char* funcname);
	char* name;
	int msgCount = 1;
};

extern char * g_dbg_func;


#endif//UTIL_DBG_H

