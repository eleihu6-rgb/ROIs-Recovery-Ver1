// #include "poUtil.h"
// #include "stdio.h"


// #ifdef WIN32
// #include "direct.h"
// #include <Windows.h>
// #else
// #include <dirent.h>
// #define _snprintf snprintf
// #endif

// inline bool exists_test(char * name) {
// 	if (FILE *file = fopen(name, "r")) {
// 		fclose(file);
// 		return true;
// 	}
// 	else {
// 		return false;
// 	}
// }

// //********************************************************
// //1)执行子进程运行cplex
// //2)参数为子目录名，要求其中必须包含输入文件 mipex1.lp
// //********************************************************
// static int runCplexChildProcessCount = 0;
// int runCplexChildProcess(char * dir) {
// 	char cplexFilePath[256] = { 0 };
// 	wchar_t cmdline[256] = { 0 };
// 	STARTUPINFOW si;
// 	PROCESS_INFORMATION pi;
// 	runCplexChildProcessCount++;

// 	_snprintf(cplexFilePath, sizeof(cplexFilePath) - 1, "%s/mipex1.mps", dir);
// 	if (!exists_test(cplexFilePath)) {
// 		printf("error: no mipex1.lp found in %s\n", dir);
// 		return -1;
// 	}

// 	ZeroMemory(&si, sizeof(si));
// 	si.cb = sizeof(si);
// 	ZeroMemory(&pi, sizeof(pi));

// 	_snwprintf(cmdline, sizeof(cmdline) - 1, L"PairingOptimizeChild.exe %S %S", dir);
// 	if (!CreateProcessW(NULL,   // No module name (use command line)
// 		cmdline,        // Command line
// 		NULL,           // Process handle not inheritable
// 		NULL,           // Thread handle not inheritable
// 		FALSE,          // Set handle inheritance to FALSE
// 		0,              // No creation flags
// 		NULL,           // Use parent's environment block
// 		NULL,           // Use parent's starting directory 
// 		&si,            // Pointer to STARTUPINFO structure
// 		&pi)           // Pointer to PROCESS_INFORMATION structure
// 		)
// 	{
// 		printf("CreateProcess failed (%d).\n", GetLastError());
// 		return -1;
// 	}

// 	WaitForSingleObject(pi.hProcess, INFINITE);
// 	CloseHandle(pi.hProcess);
// 	CloseHandle(pi.hThread);

// 	return 0;
// }