#include <stdio.h>
#include "..\RuleEngine\RuleEngine.h"
#include "..\RuleEngine\basicCalculation.h"
#include "Utility.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "..\RuleEngine\rulelog.h"
#include <windows.h> 
#include <iostream>
#include <sstream>
#include <fstream>

#include "JsonPairing.h"
#include "JsonParser\JsonParser.h"
#include "JsonPairing.h"
#include "rapidjson/writer.h"
#include "rapidjson/document.h"
#include "rapidjson/prettywriter.h"
#include "rapidjson/stringbuffer.h"

#ifdef _WIN32  
#include <windows.h>  
#define mysleep(n) Sleep(n*1000)   
#else  
#include <unistd.h>  
#define mysleep(n) sleep(n)  
#endif 

//#include <stdio.h>

using namespace rapidjson;
using namespace std;



void ptime(long time1)
{
	time_t t;
	struct tm *tim;
	char tz[32];
	char ofs[32];

	t = time1;
	//tim = std::localtime(&t);
	//tim = std::gmtime(&t);
	//std::strftime(tz, sizeof(tz), "%Z", tim);
	//std::strftime(ofs, sizeof(ofs), "%z", tim);

	std::cout << "Year:        " << (tim->tm_year + 1900) << std::endl;
	std::cout << "Month:       " << (tim->tm_mon + 1) << std::endl;
	std::cout << "Day:         " << tim->tm_mday << std::endl;
	std::cout << "Hour:        " << tim->tm_hour << std::endl;
	std::cout << "Minute:      " << tim->tm_min << std::endl;
	std::cout << "Second:      " << tim->tm_sec << std::endl;
	std::cout << "Day of week: " << tim->tm_wday << std::endl;
	std::cout << "Day of year: " << tim->tm_yday << std::endl;
	std::cout << "DST?:        " << tim->tm_isdst << std::endl;
	//std::cout << "Timezone:    " << tz << std::endl;
	//std::cout << "Offset:      " << ofs << std::endl;
}


int main(int argc, char* argv[]) 
{

	long startTemp = 1664258191, endTemp = 1664862991;
	bool bRet = Utility::GetInstancePtr()->hasWeekEndInRange(startTemp, endTemp, 8, "F");

	string strAL = "2-50";
	if (strAL.find("-") != string::npos)
	{
		string lowRange = strAL.substr(0, strAL.find("-"));
		int iRequiredLeave = stoi(lowRange);
		int iRequiredUpRange = stoi(strAL.substr(strAL.find("-") + 1));
	}

	if (strAL.find("-") != string::npos)
	{
		int iPos = strAL.find("-");
		string lowRange = strAL.substr(0, iPos);
		int iRequiredLeave = stoi(lowRange);
		int iRequiredUpRange = stoi(strAL.substr(strAL.find("-") + 1));
	}

	long lend = 1482100200;
	Local_Night_Definition locals ;
	locals.LocalStart = "22:00";
	locals.LocalEnd = "08:00";
	locals.MinRestInterval = "10:00";
	long anotherTime3 = Utility::GetInstancePtr()->getTrackingWindowEnd(8);

	long aastart = 1480028400-1;  //7AM
	long aaend = 1480039200+7200;
	bool a1test = Utility::GetInstancePtr()->isTimesCoveredInRange(aastart, aastart, 8, 180, 420);

	long yearStart1 = Utility::GetInstancePtr()->getLocalYearStartInUTC(aastart, 8);
	long nextYearStart = Utility::GetInstancePtr()->addYears(yearStart1, 1);

	long start1 = yearStart1;
	vector<Rest_Ranges*> checkWindows;
	while (start1 < nextYearStart)
	{
		Rest_Ranges *window = new Rest_Ranges();
		window->startInUtc = start1;
		window->endInUtc = start1 + 2 * 7 * 24 * 3600;

		if (window->endInUtc + 2 * 7 * 24 * 3600>nextYearStart)
			window->endInUtc = nextYearStart;

		checkWindows.push_back(window);

		start1 = window->endInUtc;
	}


	string scenarioId = "";
	string crewId = "";
	if (argc >= 2 && argv[1])
		scenarioId = argv[1];

	if (argc >= 3 && argv[2])
		crewId = argv[2];

	int id = stoi(scenarioId);

	long start;

	start = Utility::GetInstancePtr()->UTCStrToUTC("2016-11-01");
	long end = Utility::GetInstancePtr()->UTCStrToUTC("2016-11-14");

	long test1 = Utility::GetInstancePtr()->getLocalWeekStartInUTC(start, 8);
	test1 = Utility::GetInstancePtr()->getLocalWeekStartInUTC(end, 8);

	end = Utility::GetInstancePtr()->UTCStrToUTC("2016-12-31");
	test1 = Utility::GetInstancePtr()->getLocalWeekStartInUTC(end, 8);

	end = Utility::GetInstancePtr()->UTCStrToUTC("2016-11-13");
	test1 = Utility::GetInstancePtr()->getLocalWeekStartInUTC(end, 8);

	LegalityChecker *lc = new LegalityChecker(ROSTER_EDITOR, true);
	lc->setDebugCrewId(crewId);
	std::printf("Test Started:\n");
	lc->initializeDB(id);

	//if (lc->GetApplication() == PAIRING_EDITOR)
	//	test_json(lc);

	std::printf("\nData Loading Finished:");

	//lc->checkRules(lc->getCrewIndex(crewId));


	SharedPtr<CrewDataContext> data = lc->getCrewContext();
	
	vector<SharedPtr<CREW>>& crews = (data->crewList);
	vector<RULE_LEGALITY *> checkList;

	//string crewBase = Utility::GetInstancePtr()->getCrewPrimaryBase(crews[lc->getCrewIndex("E50227")]->baseList, 1487606400);

	tm temp = { 0 };
	_gmtime32_s(&temp, (__time32_t *)&(data->scenario.startDtUTC));
	int iCurrentMonth = temp.tm_mon; //[0-11]

	temp.tm_mon = 0;
	temp.tm_mday = 1;
	temp.tm_hour = 0;

	long yearStart = mktime(&temp);

	//int ii=getNumberOfDaysOffInScenario(data, lc->getCrewIndex(crewId));

	if (crewId != "")
	{
		vector<int> rules;
		int index = lc->getCrewIndex(crewId);
		if (index >= 0)
		{
			SharedPtr<CREW> crew=lc->getDataContext()->crewList[index];
			vector<SharedPtr<ROSTER>>& rosters=crew->rosterList;
			for (auto& roster : rosters)
			{
				if (roster->pairing)
					lc->checkPGRules(roster->pairing, rules, 0);
			}
		}
	}

	//add by ain
	//若commandline 参数 crewId为空，则检查场景全部crew
	//否则检查目标crew
	if (crewId == "") 
	{
		clock_t lapsed, lpased2;
		lapsed = clock();
		std::printf("Crew Sie=%d\n", crews.size());
		for (int index = 0; index < crews.size(); index++)
		{
			checkList.push_back(new RULE_LEGALITY);
			checkList[index]->PairingIndex = -1;
			checkList[index]->RosterIndex = -1;
			checkList[index]->crewIndex = index;// lc->getCrewIndex(crewId);
		}
		lpased2 = clock();
		std::printf("Time=%d\n", lpased2 - lapsed);
	}
	else 
	{
		checkList.clear();
		checkList.push_back(new RULE_LEGALITY);
		checkList[0]->crewIndex = lc->getCrewIndex(crewId);
		checkList[0]->PairingIndex = -1;
		if (crews[checkList[0]->crewIndex]->rosterList.size()>0)
			checkList[0]->RosterIndex = 1;
		else
			checkList[0]->RosterIndex = -1;
	}
	
	std::cout << "Check Rules Started." << endl;

	SharedPtr<CREW> crew = crews[checkList[0]->crewIndex];
	/*

	for (auto singleCrew : crews)
	{
		BasicCalculation* basic = new BasicCalculation(data, singleCrew);

		//vector<SharedPtr<CREW_MANDAY_CC_AM>> basics = calMandaysCcAmByAllRosters(data, crew, crew->rosterList);
		//vector<SharedPtr<ROSTER>> rosterList;
		//rosterList.push_back(single->rosterList[0]);
		//vector<SharedPtr<mandayTimes>> basics = basic->getCrewManDayTimes(crew->rosterList);
		map<long, SharedPtr<CREW_MANDAY_BASIC>> mandays = basic->calculateManDays(crew->rosterList,false);
		vector<SharedPtr<CREW_MANDAY_CC_AM>> mandasy1 = singleCrew->mandayCcAmList;

		for (auto dbman : mandasy1)
		{
			map<long, SharedPtr<CREW_MANDAY_BASIC>>::iterator single = mandays.find(dbman->crewDateUtc);
			if (single != mandays.end())
			{
				if (single->second->dp != dbman->dp)
					printf("dp not equal.\n");
				if (single->second->fdp != dbman->fdp)
					printf("fdp not equal.\n");
				if (single->second->ft != dbman->ft)
					printf("ft not equal.\n");
				if (single->second->blh != dbman->blh)
					printf("blh not equal.\n");
				if (single->second->cust_dp != dbman->cust_dp)
					printf("cust_dp not equal.\n");
				if (single->second->PER_DIEM != dbman->PER_DIEM)
					printf("PER_DIEM not equal.\n");
				if (single->second->DAY_OFF != dbman->DAY_OFF)
					printf("DAY_OFF not equal.\n");
				if (single->second->GND != dbman->GND)
					printf("GND not equal.\n");
				if (single->second->LEAVE != dbman->LEAVE)
					printf("LEAVE not equal.\n");
				if (single->second->ASB != dbman->ASB)
					printf("ASB not equal.\n");
				if (single->second->HSB != dbman->HSB)
					printf("HSB not equal.\n");
				if (single->second->CSB != dbman->CSB)
					printf("CSB not equal.\n");
				if (single->second->STANDBY != dbman->STANDBY)
					printf("STANDBY not equal.\n");
			}
		}

	}
	*/
	vector<SharedPtr<ROSTER>> rosters=crew->rosterList;

	vector<DBRule> rules=data->ruleList;
	DBRule singleRule;
	clock_t lapsed = clock();
	for (int i = 0; i < 500000; ++i)
	{
		//for (size_t iRule = 0; iRule < rules.size(); ++iRule)
		{
			//singleRule = rules[iRule];
			//if (singleRule.function == RULES::GENERAL_DUTYGROUP_QUAL)
			{
				//test(crew, &singleRule);
				unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = lc->getDataContext()->crewOnFlt;
			}
		}
	}
	clock_t lpased2 = clock();
	clock_t tempClock=(lpased2 - lapsed)/1000;
	printf("Time=%d\n", tempClock);

	int b;
	//printf("wtf?");
	//scanf("%d", &b);
	//printf("wtf!");
	//system("pause");
	//getch(); //新加的语句


	//check rules
	lc->checkRules(checkList);

	//output 
	vector<RULE_VIOLATION*> result = lc->getRuleViolations();
	ofstream outFile("ro_output_violation.txt");
	for (int i = 0; i < result.size(); i++) {
		outFile << "violation crew=" << result[i]->crewId << " roster=" << result[i]->rosterId << " rule=" << result[i]->idRule << " " << result[i]->violation_msg << "\n";
	}
	outFile.close();


	vector<SharedPtr<CREW_MANDAY_CC_AM>>& ccs = crew->mandayCcAmList;

	for (vector<SharedPtr<CREW_MANDAY_CC_AM>>::iterator cc = ccs.begin(); cc != ccs.end(); cc++)
	{
		cout << "Manday " << (*cc)->idCrew << " "
			<< utcToUtcString((*cc)->crewDateUtc) << " "
			<< " blh=" << (*cc)->blh
			<< " fdp=" << (*cc)->fdp
			<< " dayOff=" << (*cc)->DAY_OFF
			<< " GND=" << (*cc)->GND
			<< endl;
	}

	vector<string> violations = lc->getViolations();
	for (vector<string>::iterator iter = violations.begin(); iter != violations.end();iter++)
		std::cout << "rule results:" << (*iter) << endl;
	map<int, int> called = lc->getRuleCalledStat();
	unordered_map<int, int> violated = lc->getRuleViolatedStat();
	map<int, clock_t> clocks = lc->getRuleTimeStat();
	std::printf("Count:%d\n", lc->getCallCount());

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
	unordered_map<int, int> ruleViolationStatisticsNum = lc->getRuleViolatedStat();
	for (unordered_map<int, int>::iterator ruleStatItr = ruleViolationStatisticsNum.begin(); ruleStatItr != ruleViolationStatisticsNum.end(); ruleStatItr++)
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
	
	std::printf("Finish:%d\n",i);
	//getchar();
	return 0;
}
