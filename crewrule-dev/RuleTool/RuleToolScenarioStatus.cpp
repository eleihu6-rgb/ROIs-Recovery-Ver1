
#include <stdio.h>
#include <time.h>
#include <fstream>
#include "RuleTool.h"


int RuleTool::changeScenarioStatus(long long scenarioId, char * status) {
	int ret = 0;
	SharedPtr<CrewDataContext> dataCtx;

	if (!status) {
		ret = ERR_PARAM;
		goto CLEANUP;
	}

	dataCtx = SharedPtr<CrewDataContext>(new CrewDataContext(CREW_APP_TYPE_OR, false));
	dataCtx->username = this->_loginUser;
	printf(">> RuleTool::scenario_status %lld %s\n", scenarioId, status? status : "null");
	
	//20180820 ain, mantis#3573, ruleTool scenario_status避免 scenario.user变化
	//ret = dataCtx->loginAsUserFromHttpServer(this->_loginUser);
	//if (ret != SUCCESS) {
	//	printf("WARN: loginAsUser '%s' faild\n", _loginUser.c_str());
	//}
	ret = dataCtx->updateScenarioState(scenarioId, status);
	if (ret != 0) {
		printf("ERROR: update fail\n");
		goto CLEANUP;
	}
	
CLEANUP:
	return ret;
}