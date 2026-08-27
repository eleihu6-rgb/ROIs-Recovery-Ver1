/*
RuleTool模块：savePO
1、按命令行参数确定输入文件名
2、调用 java server savePO接口
*/
#include <sys/stat.h> 
#include <stdio.h>
#include <time.h>
#ifdef WIN32
#include <direct.h>
#endif
//#include <direct.h>
#include <algorithm>
#include <fstream>
#include "RuleTool.h"

int RuleTool::saveOr(char* filepath, OR_TYPE type) {
	int ret = 0;

	SharedPtr<CrewDataContext> dbData(new CrewDataContext(CREW_APP_TYPE_OR, true));//CREW_APP_TYPE_RULESRV, CREW_APP_TYPE_OR
	if (type == PO) {
		ret = dbData->saveDataPoToHttpServer(filepath);
	}
	else {
		ret = dbData->saveDataToHttpServer(filepath);
	}
	return ret;
}
