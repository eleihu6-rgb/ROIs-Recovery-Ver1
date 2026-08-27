#include <stdio.h>
#include <boost/algorithm/string.hpp>
#include "..\RuleEngine\RuleEngine.h"
#include "..\RuleEngine\basicCalculation.h"
#include "..\orUtil\Utility.h"
#include "..\db\CrewDBUtil.h"
#include "..\db\UtilFunc.h"
#include "..\RuleEngine\rulelog.h"
#include <boost/lexical_cast.hpp>
#include <iostream>
#include <sstream>
#include <fstream>
#include "..\db\orlog.h"

using namespace std;
using namespace boost;



#ifdef _WIN32  
#include <windows.h>  
#define mysleep(n) Sleep(n*1000)   
#else  
#include <unistd.h>  
#define mysleep(n) sleep(n)  
#endif 

using namespace std;

/*
   参数：realtimerule.exe scenarioID crewID application debugOption
         scenarioID必输项
		 crewID可输项，输入仅仅支持单人，不输入为检查scenario全部crew
		 application可输项，缺省为roster editor(RE). Roster Optimizer(RO); 输入application, 必须crewid
		 如果application=RO, 在RuleEngine内和RO逻辑一致，但是仅仅对已有Roster进行检查，无法模拟assign/deassign rosster
		 debugOption (0/1) 1-enable debug,otherwise disable debug
	两种输入方式: 
	     realtimerule.exe 1111 BR12345 RO/RE 0
		 realtimerule.exe 1111 （检查全部crew,app=roster editor, debug=false)
	除此以外都不支持
	所有告警生成到文件output_violation.txt
*/

int main(int argc, char* argv[])
{
	string scenarioId = "";
	string crewId = "ALL";
	string app = "RE";
	bool isDebug = false;
	string debug;
	if (argc >= 2 && argv[1])
		scenarioId = argv[1];

	if (argc >= 3 && argv[2])
		crewId = argv[2];

	if (argc >= 4 && argv[3])
		app = argv[3];

	if (argc >= 5 && argv[4])
		debug = argv[4];
	isDebug = (debug == "1");

	int appId = 2;

	int id = boost::lexical_cast<int>(scenarioId);

	transform(app.begin(), app.end(), app.begin(), ::toupper);
	transform(crewId.begin(), crewId.end(), crewId.begin(), ::toupper);
	
	if (app == "RO")
		appId = 1;
	else
		appId = 2;
	
	LegalityChecker *lc = new LegalityChecker(appId, isDebug);
	lc->initializeDB(id);
	printf("Initialize Rule Engine End\n");
	SharedPtr<CrewDataContext> data = lc->getCrewContext();
	vector<SharedPtr<CREW>>& crews = (data->crewList);
	vector<RULE_LEGALITY *> checkList;
	int index = 0;
	for (vector<SharedPtr<CREW>>::iterator crew = crews.begin(); crew != crews.end(); ++crew)
	{
		vector<SharedPtr<ROSTER>> rosters = (*crew)->rosterList;
		if (app != "RO" )
		{
			if ((crewId != "ALL" && (*crew)->idCrew == crewId) || (crewId == "ALL"))
			{
				for (int j = 0; j < rosters.size(); j++)
				{
					checkList.push_back(new RULE_LEGALITY);
					checkList[index]->PairingIndex = -1;
					checkList[index]->RosterIndex = j;
					checkList[index]->crewIndex = lc->getCrewIndex((*crew)->idCrew);
					index++;
				}
			}
		}
		else
		{
			for (int j = 0; j < rosters.size(); j++)
			{
				checkList.push_back(new RULE_LEGALITY);
				checkList[index]->PairingIndex = -1;
				checkList[index]->RosterIndex = j;
				checkList[index]->crewIndex = lc->getCrewIndex((*crew)->idCrew);
				index++;
			}
		}
	}
	printf("Start to check Rules.\n");
	if (checkList.size() > 0)
		lc->checkRules(checkList);
	else
		printf("Crew Not Found\n");

	//output 
	vector<RULE_VIOLATION*> result = lc->getRuleViolations();
	ofstream outFile("output_violation.txt");
	for (int i = 0; i < result.size(); i++) {
		outFile << "Crew=[" << result[i]->crewId << "], Roster=[" << result[i]->rosterId << "], Rule=[" << result[i]->idRule << "] " << result[i]->violation_msg << "\n";
	}
	outFile.close();


	ofstream ruleStatisticsFile;
	string ruleStatisticsFilename = "Test-RuleStatistics.txt";
	ruleStatisticsFile.open(ruleStatisticsFilename.c_str(), ios::out);

	// Rule statistics - begin
	ruleStatisticsFile << "Number: " << endl;
	map<int, int> ruleStatisticsNum = lc->getRuleCalledStat();
	for (map<int, int>::iterator ruleStatItr = ruleStatisticsNum.begin(); ruleStatItr != ruleStatisticsNum.end(); ruleStatItr++)
	{
		ruleStatisticsFile << "    " << (*ruleStatItr).first << ": " << (*ruleStatItr).second << endl;
	}

	// Rule statistics - begin
	ruleStatisticsFile << "Violated: " << endl;
	map<int, int> ruleViolationStatisticsNum = lc->getRuleViolatedStat();
	for (map<int, int>::iterator ruleStatItr = ruleViolationStatisticsNum.begin(); ruleStatItr != ruleViolationStatisticsNum.end(); ruleStatItr++)
	{
		ruleStatisticsFile << "    " << (*ruleStatItr).first << ": " << (*ruleStatItr).second << endl;
	}

	ruleStatisticsFile << "Time: " << endl;
	map<int, clock_t> ruleStatisticsTime = lc->getRuleTimeStat();
	for (map<int, clock_t>::iterator ruleStatItr = ruleStatisticsTime.begin(); ruleStatItr != ruleStatisticsTime.end(); ruleStatItr++)
	{
		ruleStatisticsFile << "    " << (*ruleStatItr).first << ": " << (*ruleStatItr).second << endl;
	}

	ruleStatisticsFile.close();

	lc->releaseDB();
	int i = lc->getRuleSize();
	delete lc;

	printf("Rule Check Finished:%d\n", i);

	return 0;
}
