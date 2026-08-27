
#include <stdio.h>
#include <time.h>
#include <fstream>
#include "RuleTool.h"


bool RuleTool::saveScenarioToCsv(long long scenarioId) {
	bool ret = true;

	SharedPtr<CrewDataContext> dataCtx(new CrewDataContext(CREW_APP_TYPE_OR, false));
	printf(">> RuleTool::scenario\n");
	//db connection
	//makeDBConnection(ctx.get(), connStr.c_str(), username.c_str(), password.c_str());

	ret = dataCtx->loadData(scenarioId);  CHECK_ERROR("loadData");
	if (ret != 0) {
		goto CLEANUP;
	}
	ret = dataCtx->saveScenarioCsv("scenario.data.txt");
	if (ret != 0) {
		printf("ERROR: save scenario to csv fail, error %d\n", ret);
	}

CLEANUP:
	printf("<< RuleTool::scenario\n");
	return ret;
}
