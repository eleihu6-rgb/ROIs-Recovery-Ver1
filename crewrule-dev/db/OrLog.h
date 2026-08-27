#ifndef OR_LOG_H
#define OR_LOG_H

#define OR_LOG 1
#ifdef OR_LOG
#define printf _func_log_print
#define log_print _func_log_print
#endif

void _func_log_print(const char * format, ...);



//--------- log to file ----------
void _func_log_file(FILE* fp, const char *format, ...);

#endif//OR_LOG_H