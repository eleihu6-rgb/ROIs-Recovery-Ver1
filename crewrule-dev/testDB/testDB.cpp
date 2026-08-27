
#include "mongoose.h"
#include <stdio.h>
#include <time.h>
#include <iostream>
#include <sstream>
#include <fstream>
#include <string>
#include <map>
#include <omp.h>
#include <unordered_map>
#include <unordered_set>
#include <sys/timeb.h>
#include <direct.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
//#include "JsonPairing.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "StringUtil.h"
//#include "..\RuleExport\rule.h"
#include "indexCrewBaseRankFleet.h"
#include "UtilDbg.h"
#include "index2dArray.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "..\RuleEngine\RuleEngine.h"
#include "PairingCompositionCalculator.h"
//#include "..\RuleEngine\RuleEngine.h"
#include "OrLog.h"
#include "time64.h"
#include "aes.h"
#include "base64.h"
#include "CustomBiz\CustomBiz.h"
#include "csv\csv_reader.h"
#include "Utility.h"
#include "RuleParams.h"

//#include "vld.h"
using namespace std;

//void test_file_scenario (Scenario &scenario);
void test_time_t();
void test_s(ostream& os);
//void test_parse_json();
//void test_parse_json_roster(string filename, vector<SharedPtr<ROSTER>> &list);
void test_utc();
void log_warning(const char * logfile, const char * msg);
void testMultimap();
void test_add_del_roster(SharedPtr<CrewDataContext>& dbData, PairingDBContext& ctx);
void test_ZH_PO_txt(SharedPtr<CrewDataContext> &dbData, long long scenarioId);
void test_pairing_compare(PairingDBContext* ctx);
void test_2d_array();
void test_recency();
void test_checkRule(SharedPtr<CrewDataContext> dbData);
void test_dbData_compare(SharedPtr<CrewDataContext> dbData, SharedPtr<CrewDataContext> dbDataCsv);
int getMilliCount();
int getMilliSpan(int nTimeStart);
void test_map_bound();
void test_reduce_scenario_size(SharedPtr<CrewDataContext>& dbData);
void testHttpServer(long long scenarioId);
void test_print_manday(SharedPtr<CREW> crew, time_t start, time_t end);
void test_date_fmt();
void test_calculate_pairing_composition(long long scenarioId);
void checkRule(SharedPtr<LegalityChecker>& ruleEngine, SharedPtr<CrewDataContext>& dbData, SharedPtr<CREW>& crew);

bool checkRule2124(Duty* duty, rule2124* ruleParam);

//PBDD calculator
void setDutyBrief(Duty* duty, CrewDataContext* dbData);
int calculateDutyBrief(Duty* duty, CrewDataContext* dbData);

//void test_aes();
extern char * validatePairing(Pairing *pairing, char * errMsgBuf, int bufsize);
struct STA {
	STA() { i = 0;  cout << "new STA" << endl; }
	STA(int i) { this->i = i; cout << "new STA " << i << endl; }
	STA(STA& o) { i = o.i;  cout << "new STA copy " << i << endl; }
	~STA() { cout << "del STA " << i << endl; }
	void setI(int i) { this->i = i; }
private:
	int i;
};

//20191229 ain, demo: 读取特别数据段
//1. 实现 csvReader子类，getParser/getParserName留空
//2. 调用 reader.readSingleTableFromCsv()，读取csv中特定数据段，
//3. output参数 result存放读取结果，读取结果为 vector<string>
//4. 正常定制需求，只需修改 if (isTargetTable)逻辑分支内容
class xxxCsvReader : public csvReader {
public:
	xxxCsvReader() {}//继承、实现空函数
	shared_ptr<csvParser> getParser(string tableName) { return NULL; }//继承、实现空函数
	string getParserName(string tableName) { return ""; }//继承、实现空函数

	void readSingleTableFromCsv(string filepath, string tableName, map<long, map<string, string>>& result);
};

void xxxCsvReader::readSingleTableFromCsv(string filepath, string tableName, map<long, map<string, string>>& result) {

	bool isTargetTable = false;
	ifstream in(filepath); printf("parse csv start\n");
	
	while (in.good()) {
		string line = readLine(in);
		if (line.empty()) {
			//skip empty line
		}
		//line for table header: init table & headers
		else if (line.substr(0, strnlen(TableSeparator, 100)) == TableSeparator) {
			if (line.substr(strnlen(TableSeparator, 100)).find(tableName) == 0) 
				isTargetTable = true;
			else 
				isTargetTable = false;
		}
		else {
			if (isTargetTable) {
				//处理目标数据段内容, 按业务需求自行实现每一行如何处理
				//这里以陈坚 cacc需求为例
				vector<string> raw;
				split(line, '^', raw);
				long field1 = atol(raw[0].c_str());
				string field2 = raw[1];
				string field3 = raw[2];

				result[field1][field2] = field3;
			}
		}
	}

	in.close();
}

void printPtns(string msg, vector<Pairing*>& list);

void printDutyRest(Duty* d, string msg) {
	cout << "**DBG " << msg << " duty fdp=" << d->getPlanFDP() << "  min_rest=" << d->getMinRest() << " min_rest_after_duty" << d->getMinRestAfterDuty() << endl;
}

Segment * findFlight(SharedPtr<CrewDataContext> dbData, long long fltId, string fltnum, string date);

//*****************************************
//Main
//*****************************************
void main(int argc, char ** argv) {

	int ret = 0; 
	//------------------- load db ----------------------
	{
		long long scenarioList[] = { 0 };
		if (argc > 1) {
			scenarioList[0] = atoll(argv[1]);
		}
		
		for (long long& scenarioId : scenarioList) {

			char * dbg = "load db";
			try {
				int ret = 0;
				SharedPtr<CrewDataContext> dbData(new CrewDataContext(CREW_APP_TYPE_OR, true));//CREW_APP_TYPE_RULESRV, CREW_APP_TYPE_OR
				//dbData->loadDataPoCsv("po_input.txt");
				dbData->loadDataCsv("20210816_223400_764_loadScenario.data.txt");
				//dbData->saveDataToHttpServer("ro_output.txt");

				LegalityChecker ruleEngine(PAIRING_OPTIMIZER);
				ruleEngine.setDataContext(dbData);
				{
					Pairing* pg = dbData->pairingIdMap[27494768];
					for (auto& d : pg->getDutyVec()) {
						ruleEngine.basicSetting(d, pg->getBase());
						calculatePairingDutyTimes(d, dbData.get());
					}
					test_log_pairing("DBG", pg);
					exit(0);
				}
				////duty1
				//Segment * s1 = findFlight(dbData, 60008731, "6101D", "2021-6-30 08:40");
				//vector<Segment*> segs1;
				//segs1.push_back(s1);
				//Duty * d1 = new Duty(segs1);
				//ruleEngine.basicSetting(d1);
				//createPairingNodeOfDuty(d1, dbData.get());
				//createPairingNodeOfSeg(d1, dbData.get());
				//calculatePairingDutyTimes(d1, dbData.get());

				////duty2
				vector<Segment*> segs2;
				segs2.push_back(findFlight(dbData, 61841256, "9863", "2021-6-1 18:10"));
				segs2.push_back(findFlight(dbData, 61840920, "9863", "2021-6-1 20:45"));
				//segs2.push_back(findFlight(dbData, 0, "9772", "2021-6-2 09:35"));
				//segs2.push_back(findFlight(dbData, 0, "9798", "2021-6-1 21:15"));
				for (auto& s : segs2) {
					s->setAssignment("FLY");
				}
				//20231201 RuleParams::GetInstancePtr()->getAndSetLongTransitRest(segs2);
				Duty * d2 = new Duty(segs2);


				d2->setPlanFDP(5800);

				//ruleEngine.basicSetting(d2);					printDutyRest(d2, "1");///TEST
				createPairingNodeOfDuty(d2, dbData.get());		printDutyRest(d2, "2");///TEST
				createPairingNodeOfSeg(d2, dbData.get());
				//calculatePairingDutyTimes(d2, dbData.get());	printDutyRest(d2, "4");///TEST

				shared_ptr<PairingDutyNode> brief(new PairingDutyNode);
				brief->setAirport(segs2[0]->getDate());
				brief->setStartLoc(segs2[1]->getStartTimeLocSch() - 90 * 60);
				brief->setEndLoc(segs2[1]->getStartTimeLocSch());
				brief->setStartUtc(brief->getStartLoc() - 8 * 3600);
				brief->setEndUtc(brief->getEndLoc() - 8 * 3600);
				brief->setType("SEGMENT");
				brief->setNode("BRIEF");
				d2->pairingDutyNodes.push_back(brief);

				for (auto& n : d2->pairingDutyNodes) {
					if (n->getType() == "DUTY" && n->getNode() == "BRIEF") {
						n->setStartLoc(n->getStartLoc() - 90 * 60);
						n->setStartUtc(n->getStartUtc() - 90 * 60);
					}
					if (n->getType() == "DUTY" && n->getNode() == "PICKUP") {
						n->setStartLoc(n->getStartLoc() - 90 * 60);
						n->setStartUtc(n->getStartUtc() - 90 * 60);
						n->setEndLoc(n->getStartLoc() - 90 * 60);
						n->setEndUtc(n->getStartUtc() - 90 * 60);
					}
					if (n->getType() == "SEGMENT") {
						n->setToSegmentId(d2->getSegment(0)->getDBId());
					}
				}
				//ruleEngine.basicSetting(d2);

				//rest
				//for (DBRule& rp : dbData->_ruleFuncMap[2124]) {
				//	rule2124* cache = (rule2124*)rp.parsedParam.get();
				//	if (ruleEngine.checkMinRest(d2, &rp)) {
				//		d2->setMinRest(cache->minRest);
				//		d2->setMinRestAfterDuty(cache->minRest);
				//	}
				//}


				printDutyRest(d2, "5");///TEST
				////duty3
				//vector<Segment*> segs3;
				//segs3.push_back(findFlight(dbData, 0, "6105", "2021-7-1 12:10"));
				//segs3.push_back(findFlight(dbData, 0, "6106", "2021-7-1 17:10"));
				//segs3.push_back(findFlight(dbData, 0, "6106", "2021-7-1 21:20"));
				//Duty * d3 = new Duty(segs3);
				//ruleEngine.basicSetting(d3);
				//createPairingNodeOfDuty(d3, dbData.get());
				//createPairingNodeOfSeg(d3, dbData.get());
				//calculatePairingDutyTimes(d3, dbData.get());

				vector<Duty*> duties;
				//duties.push_back(d1);
				duties.push_back(d2);
				//duties.push_back(d3);
				Pairing * pg = new Pairing(duties);

				//long long pid = 31056678;
				//Pairing * pg = dbData->pairingIdMap[pid];
				pg->setComplements(map<string, int>());

				vector<Pairing*> pgList;
				pgList.push_back(pg);

				//PO ruleEngine rest
				calculatePairingDutyTimes(pg, dbData.get());
				printDutyRest(d2, "5a");///TEST

				vector<int> empty;
				ruleEngine.checkPGRules(pg, empty);
				for (std::size_t k = 0; k < pg->getNumDuties(); k++) {
					Duty* d = pg->getDuty(k);
					d->setActualRest(d->getMinRest());
				}
				printDutyRest(d2, "6");///TEST
				//PO ruleEngine
				for (auto& d : pg->getDutyVec()) {
					d->needRecalculation = true;
					ruleEngine.basicSetting(d, pg->getBase());
				}
				printDutyRest(d2, "7");///TEST

				test_log_pairing("DBG", pg); 

				//dbData->savePoCsv("po_output.txt", pgList, vector<Segment*>());
				string fleet = "738";
				dbData->saveDataPO(pgList, fleet, vector<Segment*>());
				printDutyRest(d2, "8");///TEST
				
				for (auto& d : pg->getDutyVec()) {
					for (auto& s : d->getSegments()) {
						cout << "SEGMENT fltNum=" << s->getFlightNumber() << " tail=" << s->getTailNum() << endl;
					}
				}

				map<string, shared_ptr<DBAircraft>> mm = dbData->fltIdToAircraftMap;
				for (auto& it : mm) {
					DBAircraft * ac = it.second.get();
					cout << "TAIL    " << it.first << " restFacility=" << ac->restFacility << endl;
				}

				for (auto& d : pg->getDutyVec()) {
					printDutyRest(d, "END");
				}
			}
			catch (exception& ex) {

				printf("EXCEPTION: %s %d fail, %s\n", dbg, scenarioId, ex.what());
			}
			catch (...) {
				printf("EXCEPTION: %s %d fail\n", dbg, scenarioId);
			}
		}
	}
	system("echo     ");
	printf("test done\n");
	getchar();
}

Segment * findFlight(SharedPtr<CrewDataContext> dbData, long long fltId, string fltnum, string stdStr) {
	time_t std = utcStrToUtc((char*)stdStr.c_str());


	for (auto& it : dbData->flightIdMap) {
		auto& flt = it.second;
		if (flt->getDBId() == fltId && fltId != 0) {
			return flt;
		}
		if (std != flt->getStartTimeLocSch()) {
			continue;
		}
		if (flt->getFlightNumber() != fltnum) {
			continue;
		}
		return flt;
	}

	for (auto& i : dbData->pairingInputFlights) {
		Segment* flt = &i;
		if (flt->getDBId() == fltId) {
			cout << "stdStr=" << stdStr 
				<< " std=" << utcToUtcString(std)
				<< " flt.std=" << utcToUtcString(flt->getStartTimeLocSch())
				<< endl;
			printf("");
			return flt;
		}
		if (std != flt->getStartTimeLocSch()) {
			continue;
		}
		if (flt->getFlightNumber() != fltnum) {
			continue;
		}
		return flt;
	}
	for (auto& i : dbData->pairingInputFerrys) {
		Segment* flt = i;
		if (flt->getDBId() == fltId)
			return flt;
		if (std != flt->getStartTimeLocSch()) {
			continue;
		}
		if (flt->getFlightNumber() != fltnum) {
			continue;
		}
		return flt;
	}
	return NULL;
}

void printPtns(string msg, vector<Pairing*>& list) {
	std::cout << "Pairings " << msg << std::endl;
	map<string, int> m;
	for (auto& ptn : list) {
		string assignment = ptn->getPrimeActivity();
		m[assignment]++;
	}
	for (auto& it : m) {
		auto type = it.first;
		auto count = it.second;
		cout << "    " << type << "=" << count << endl;
	}
}

void checkRule(SharedPtr<LegalityChecker>& ruleEngine, SharedPtr<CrewDataContext>& dbData, SharedPtr<CREW>& crew) {

	int crewIndex = -1;
	for (std::size_t k = 0; k < dbData->crewList.size(); k++) {
		if (dbData->crewList[k]->idCrew == crew->idCrew) {
			crewIndex = (int)k; break;
		}
	}

	vector<RULE_LEGALITY *> checkList;
	for (std::size_t i = 0; i< crew->rosterList.size(); i++)
	{
		auto& roster = crew->rosterList[i];
		RULE_LEGALITY *rl = new RULE_LEGALITY;
		rl->crewIndex = crewIndex;
		rl->PairingIndex = -1;
		rl->isLegal = true;
		rl->RosterIndex = roster->indexInRosterListOfCrew;
		checkList.push_back(rl);
	}
	ruleEngine->checkRules(checkList);
}

void test_utf8_gbk() {

	char strGBK[10] = { "中国" };//gbk 中国
	char strUtf8[20] = { "123456中国" }; //utf8：西湖

	string sGBK = strGBK;
	string sUtf8 = strUtf8;

	ofstream gbk("gbk.txt");
	gbk << strGBK << endl;
	gbk.close();


	ofstream utf8("utf8.txt");
	utf8 << strUtf8 << endl;
	utf8.close();

	//getchar();

	time_t t = utcStrToUtc("2018-1-1 23:59:59");
	string str = utcToUtcString(t);

	time_t t1 = utcStrToUtc("2018-1-1 00:00:00");
	time_t dayStartInUtcOfT1 = Utility::GetInstancePtr()->getLocalDayStartInUTC(t1, 8);

	vector<string> a = { "10/12/2018", "2018-1-1", "12-31-2018", "2018/1/1", "31/12/2018", "31/Mon/2018", "10/12/2018" };
	for (string s : a) {
		tm m = { 0 };
		strToTm((char*)s.c_str(), &m);
		cout << "TEST " << s << " -> " << m.tm_year + 1900 << "/" << m.tm_mon + 1 << "/" << m.tm_mday << " " << m.tm_hour << ":" << m.tm_min << endl;
	}

}

//测试计算 pairing_comp，针对mantis#3703
void test_calculate_pairing_composition(long long scenarioId) {

	SharedPtr<CrewDataContext> dbData(new CrewDataContext(CREW_APP_TYPE_OR, true));//CREW_APP_TYPE_RULESRV
	int ret = dbData->loadDataPO(scenarioId);
	Pairing* pairing = NULL;
	//make pairing
	vector<Segment*> flts;
	for (auto& f : dbData->pairingInputFlights) {
		if (f.getDBId() == 179630 || f.getDBId() == 179631)
			flts.push_back(&f);
	}
	Duty * duty = new Duty(flts);
	vector<Duty*> duties;
	duties.push_back(duty);
	pairing = new Pairing(duties);
	//compute
	vector<Pairing*> testList;
	testList.push_back(pairing);
	pairing->setComplements(map<string, int>());//clear
	PairingCompositionCalculator calculator(dbData->scenario.airline, dbData->scenario.division, dbData->ruleList, dbData->fleetList, dbData->compositionList, dbData->compositionRankMap, dbData->rankList, dbData->fltIdToAircraftMap, &(dbData->systemParamMap));
	calculator.calculate(testList);
	//output
	cout << "PAIRING comp=" << pairing->getCompositionId();
	for (auto& it : pairing->getComplements()) {
		cout << " " << it.first << "=" << it.second;
	}
	cout << endl;
	map<string, int> compIdMultiplerMap = pairing->getComplements();
	map<long long, int> compMultiplerMap = calculator.computeCompIdAndMultiplierFromRankValue(compIdMultiplerMap);
	cout << "PAIRING_COMPOSITION ";
	for (auto& it : compMultiplerMap) {
		cout << " " << it.first << "=" << it.second;
	}
	cout << endl;
	dbData->savePoCsv("po_output_test.txt", testList, vector<Segment*>());
}

void test_print_manday(SharedPtr<CREW> crew, time_t start, time_t end) {
	for (auto& mday : crew->mandayCcAmList) {
		if (mday->crewDateUtc < start || mday->crewDateUtc > end)
			continue;
		cout << " MDAY "
			<< " " << mday->idCrew
			<< " " << utcToUtcString(mday->crewDateUtc)
			<< " BLH=" << mday->blh
			<< " dp=" << mday->dp
			<< " cust_dp=" << mday->cust_dp
			<< " OFF=" << mday->DAY_OFF
			<< "\n";
	}
}

void test_reduce_scenario_size(SharedPtr<CrewDataContext>& dbData) {

	///保留10个crew，60 pairing
	vector<SharedPtr<CREW>> selectCrew;
	for (int i = 0; i < 10; i++) {
		int index = rand() % dbData->crewList.size();
		selectCrew.push_back(dbData->crewList[i]);
	}
	map<long long, Pairing*> allPairing;
	for (auto& p : dbData->pairingList) {
		allPairing[p->getDbId()] = p;
	}
	map<long long, Pairing*> selectPairing;
	for (int i = 0; i < 70; i++) {
		int index = rand() % dbData->pairingList.size();
		Pairing * p = dbData->pairingList[i];
		selectPairing[p->getDbId()] = p;
	}
	for (auto& crew : selectCrew) {
		for (auto& roster : crew->rosterList) {
			if (roster->pairId != 0)
				selectPairing[roster->pairId] = allPairing[roster->pairId];
		}
	}

	//回填数据
	dbData->crewList = selectCrew;
	dbData->pairingList.clear();
	for (auto& it : selectPairing) {
		dbData->pairingList.push_back(it.second);
	}

	for (int i = (int)dbData->pairingListForRO.size() - 1; i >= 0; i--) {
		Pairing* p = dbData->pairingListForRO[i];
		if (selectPairing.find(p->getDbId()) == selectPairing.end()) {
			dbData->pairingListForRO.erase(dbData->pairingListForRO.begin() + i);
		}
	}
	for (int i = (int)dbData->pairingListForROWithOpenComposition.size() - 1; i >= 0; i--) {
		Pairing* p = dbData->pairingListForROWithOpenComposition[i];
		if (selectPairing.find(p->getDbId()) == selectPairing.end()) {
			dbData->pairingListForROWithOpenComposition.erase(dbData->pairingListForROWithOpenComposition.begin() + i);
		}
	}

	cout << "selectCrew = " << selectCrew.size() << endl;
	cout << "selectPairing = " << selectPairing.size() << endl;
	getchar();
}

//测试法规
void test_checkRule(SharedPtr<CrewDataContext> dbData) {

	cout << "DBG dbData.startUTC=" << utcToUtcString(dbData->startUtc) << " dbData.endUTC=" << utcToUtcString(dbData->endUtc) << endl;
	cout << "DBG scenario.startDtUTC=" << utcToUtcString(dbData->scenario.startDtUTC) << " scenario.endDtUtc=" << utcToUtcString(dbData->scenario.endDtUTC) << endl;
	
	LegalityChecker ruleEngine(ROSTER_EDITOR);
	ruleEngine.setDataContext(dbData);
	auto& engineDbData = ruleEngine.getDataContext();
	vector<RULE_LEGALITY *> checkList;
	for (std::size_t index = 0; index < engineDbData->crewList.size(); index++)
	{
		if (true
			&& engineDbData->crewList[index]->idCrew != "D93382"
			//&& engineDbData->crewList[index]->idCrew != "F57371"
			//&& engineDbData->crewList[index]->idCrew != "184629"
			)
			continue;

		SharedPtr<CREW>& crew = engineDbData->crewList[index];
		for (auto& md : crew->mandayCcAmList) {
			cout << "CALC MANDAY  " << md->idCrew << " " << utcToUtcString(md->crewDateUtc) << " " << md->blh << " " << md->fdp << " "
				<< md->dp << "/" << md->cust_dp << endl;
		}

		//for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
		RULE_LEGALITY * item = new RULE_LEGALITY();
		item->PairingIndex = -1;
		item->RosterIndex = -1;
		item->crewIndex = (int)index;// lc->getcrewindex(crewid);
		checkList.push_back(item);
		//}
	}
	printf("check rules start... %d\n", checkList.size());
	ruleEngine.checkRules(checkList);
	printf("check rules end\n");
	printf("crews: ");
	for (auto& item : checkList) {
		cout << " " << dbData->crewList[item->crewIndex]->idCrew;
	}
	cout << endl;

	for (auto& it : ruleEngine.getRuleViolations()) {
		long long func = it->idRule / 1000;
		//if (func == 8037) 
		cout << "VIOLATION: crew=" << it->crewId
			<< " rule=" << it->idRule
			<< " str=" << utcToUtcString(it->startDTUtc)
			<< " msg=" << it->violation_msg
			<< "\n";
	}


	//rule statistics
	ofstream of("rule_statistics.txt");
	for (auto& entry : RuleStatistics::GetInstancePtr()->getRuleCalledClock()) {
		of << "rule " << entry.first << " : " << entry.second << endl;
	}
	of.close();
}

void test_dbData_compare(SharedPtr<CrewDataContext> dbData, SharedPtr<CrewDataContext> dbDataCsv) {
	//crew
	vector<string> crewIdNotInDb;
	map<string, bool> dbCrewIdInCsvMap;
	for (auto& c : dbData->crewIdMap) {
		dbCrewIdInCsvMap[c.first] = false;
	}
	for (auto& c : dbDataCsv->crewIdMap) {
		string csvCrewId = c.first;
		if (dbCrewIdInCsvMap.find(csvCrewId) == dbCrewIdInCsvMap.end())
			crewIdNotInDb.push_back(csvCrewId);
		else 
			dbCrewIdInCsvMap[csvCrewId] = true;
	}
	cout << "crew found in csv & not found in db: "; 
	for (string csvCrewId : crewIdNotInDb)
		cout << csvCrewId << ",";
	cout << endl;
	cout << "crew= found in db, not found in csv: ";
	for (auto& c : dbCrewIdInCsvMap) {
		if (!c.second)
			cout << c.first << ",";
	}
	cout << endl;

	//roster
	cout << "dbData.rosterList.size=" << dbData->rosterList.size() << "  csvDbData.rosterList.size=" << dbDataCsv->rosterList.size() << endl;
	//pairing
	cout << "dbData.pairingList.size=" << dbData->pairingList.size() << "  csvDbData.pairingList.size=" << dbDataCsv->pairingList.size() << endl;
	map<long long, long long> csvPairingIdMap;
	for (auto& p : dbDataCsv->pairingList) {
		csvPairingIdMap[p->getDbId()] = p->getDbId();
	}
	cout << "pairing_id found in db not in csv: ";
	int i = 0;
	for (auto& p : dbData->pairingList) {
		long long pairingId = p->getDbId();
		if (csvPairingIdMap.find(pairingId) == csvPairingIdMap.end())
			cout << pairingId << ", ";
	}
	cout << endl;

	//rule
	cout << "dbData.ruleList.size=" << dbData->ruleList.size() << "  csvDbData.ruleList.size=" << dbDataCsv->ruleList.size() << endl;
	//cq
	cout << "dbData.cqfList.size=" << dbData->cqfList.size() << "  csvDbData.cqfList.size=" << dbDataCsv->cqfList.size() << endl;
}

void test_pairing_compare(PairingDBContext* ctx) {
	///scenarioA scenarioB
	int scenarioA = 3992;
	int scenarioB = 4067;
	{
		SharedPtr<CrewDataContext> dbDatascenarioA(new CrewDataContext);
		dbDatascenarioA->loadData(scenarioA);
		map<long long, Pairing*> mvoscenarioA;
		map<long long, Pairing*> mvpscenarioA;
		map<long long, Pairing*> allScenarioA;
		for (std::size_t i = 0; i < dbDatascenarioA->pairingList.size(); i++) {
			Pairing * p = dbDatascenarioA->pairingList[i];
			if (p->getPrimeActivity() == "MVO") mvoscenarioA[p->getDbId()] = p;
			if (p->getPrimeActivity() == "MVP") mvpscenarioA[p->getDbId()] = p;
			allScenarioA[p->getDbId()] = p;
		}

		SharedPtr<CrewDataContext> dbDatascenarioB(new CrewDataContext);
		dbDatascenarioB->loadData(scenarioB);
		map<long long, Pairing*> mvoscenarioB;
		map<long long, Pairing*> mvpscenarioB;
		map<long long, Pairing*> allScenarioB;
		for (std::size_t i = 0; i < dbDatascenarioB->pairingList.size(); i++) {
			Pairing * p = dbDatascenarioB->pairingList[i];
			if (p->getPrimeActivity() == "MVO") mvoscenarioB[p->getDbId()] = p;
			if (p->getPrimeActivity() == "MVP") mvpscenarioB[p->getDbId()] = p;
			allScenarioB[p->getDbId()] = p;
		}

		//exist in scenarioA, not in scenarioB
		map<long long, Pairing*>::iterator it;
		printf("scenario[%d].pairings.size=%d\n", scenarioA, allScenarioA.size());
		printf("scenario[%d].pairings.size=%d\n", scenarioB, allScenarioB.size());
		for (it = allScenarioA.begin(); it != allScenarioA.end(); it++) {
			if (allScenarioB.find(it->first) == allScenarioB.end()) {
				printf("ERROR: Pairing pairing %lld in scenarioA not in scenarioB, %s ~ %s\n", it->second->getDbId(), utcToUtcString(it->second->getStartTime()).c_str(), utcToUtcString(it->second->getEndTime()).c_str());
			}
		}
		for (it = allScenarioB.begin(); it != allScenarioB.end(); it++) {
			if (allScenarioA.find(it->first) == allScenarioA.end()) {
				printf("ERROR: Pairing pairing %lld in scenarioA not in scenarioB, %s ~ %s\n", it->second->getDbId(), utcToUtcString(it->second->getStartTime()).c_str(), utcToUtcString(it->second->getEndTime()).c_str());
			}
		}
		printf("compare end\n");
		//for (it = mvoscenarioA.begin(); it != mvoscenarioA.end(); it++) {
		//	if (mvoscenarioB.find(it->first) == mvoscenarioB.end()) {
		//		printf("Pairing mvo %lld in scenarioA not in scenarioB, %s ~ %s\n", it->second->getDbId(), utcToUtcString(it->second->getStartTime()).c_str(), utcToUtcString(it->second->getEndTime()).c_str());
		//	}
		//}
		//for (it = mvoscenarioB.begin(); it != mvoscenarioB.end(); it++) {
		//	if (mvoscenarioA.find(it->first) == mvoscenarioA.end()) {
		//		printf("Pairing mvo %lld not in scenarioA in scenarioB, %s ~ %s\n", it->second->getDbId(), utcToUtcString(it->second->getStartTime()).c_str(), utcToUtcString(it->second->getEndTime()).c_str());
		//	}
		//}
		//for (it = mvpscenarioA.begin(); it != mvpscenarioA.end(); it++) {
		//	if (mvpscenarioB.find(it->first) == mvpscenarioB.end()) {
		//		printf("Pairing mvp %lld in scenarioA not in scenarioB, %s ~ %s\n", it->second->getDbId(), utcToUtcString(it->second->getStartTime()).c_str(), utcToUtcString(it->second->getEndTime()).c_str());
		//	}
		//}
		//for (it = mvpscenarioB.begin(); it != mvpscenarioB.end(); it++) {
		//	if (mvpscenarioA.find(it->first) == mvpscenarioA.end()) {
		//		printf("Pairing mvp %lld not in scenarioA in scenarioB, %s ~ %s\n", it->second->getDbId(), utcToUtcString(it->second->getStartTime()).c_str(), utcToUtcString(it->second->getEndTime()).c_str());
		//	}
		//}
	}

}

//按PO 结果质量检查工具格式导出pairing 结果
void test_ZH_PO_txt(SharedPtr<CrewDataContext> &dbData, long long scenarioId) {
	//string sid = "" + scenarioId;
	vector<Pairing*> pairingOfScenario;
	for (std::size_t i = 0; i < dbData->pairingList.size(); i++) {
		if (dbData->pairingList[i]->getScenarioId() == scenarioId)
			pairingOfScenario.push_back(dbData->pairingList[i]);
	}
	cout << "pairing.size = " << pairingOfScenario.size() << endl;

	stringstream filename;
	filename << "pairing" << scenarioId << ".txt";
	ofstream f(filename.str());

	for (std::size_t i = 0; i < pairingOfScenario.size(); i++) {
		Pairing* p = pairingOfScenario[i];
		f << "Pairing " << i << "\n";

		for (std::size_t dutyI = 0; dutyI < p->getNumDuties(); dutyI++) {
			Duty * d = p->getDuty(dutyI);
			char startLoc[100] = { 0 };
			char endLoc[100] = { 0 };
			utcToUtcStr(d->getStartTime(), startLoc, sizeof(startLoc));
			utcToUtcStr(d->getEndTime(), endLoc, sizeof(endLoc));
			f << "Duty " << dutyI << " " << d->getDepStation() << " " << startLoc << " " << d->getArrStation() << " " << endLoc << "\n";

			for (std::size_t segI = 0; segI < d->getNumSegments(); segI++) {
				Segment * s = d->getSegment(segI);
				char segStartLoc[100] = { 0 };
				utcToUtcStr(s->getStartTimeLocSch(), segStartLoc, sizeof(segStartLoc));
				f << "Segment " << segI << " " << segStartLoc << " " << s->getFleetCD() << " " << s->getDepStation() << " " << s->getArrStation() << " " << s->getSegNumber() << "\n";
			}
		}
	}
	f.close();
}

void log_warning(const char * logfile, const char * msg) {
	FILE * fp = fopen(logfile, "a");
	fprintf(fp, msg);
	fprintf(fp, "\n");
	fclose(fp);
}


void testMultimap() {
	DBG_HELP("testMultimap");
	dbg_stack_trace::lockStackTrace();
	
	multimap<int, string> m;
	m.insert(pair<int, string>(1, "A"));
	m.insert(pair<int, string>(1, "B"));
	m.insert(pair<int, string>(1, "B"));
	m.insert(pair<int, string>(2, "A"));
	m.insert(pair<int, string>(2, "B"));

	multimap<int, string>::iterator it = m.begin();
	while ( it != m.end()) {

		pair<multimap<int, string>::iterator, multimap<int, string>::iterator> ret = m.equal_range(it->first);
		for (it = ret.first; it != ret.second; ++it){
			printf("%d=%s\n", it->first, it->second.c_str());
		}
	}
	printf("");
}

int getMilliCount(){
	timeb tb;
	ftime(&tb);
	int nCount = tb.millitm + (tb.time & 0xfffff) * 1000;
	return nCount;
}

int getMilliSpan(int nTimeStart){
	int nSpan = getMilliCount() - nTimeStart;
	if (nSpan < 0)
		nSpan += 0x100000 * 1000;
	return nSpan;
}


void test_add_del_roster(SharedPtr<CrewDataContext>& dbData, PairingDBContext& ctx) {
	string idcrew = "BR206056";
	long long pair_id = 14638312;
	string rank = "CA";
	Pairing * pairing = NULL;
	SharedPtr<CREW>& crew = dbData->crewIdMap[idcrew];
	for (std::size_t i = 0; i < dbData->pairingList.size(); i++) {
		if (dbData->pairingList[i]->getDbId() == pair_id) {
			pairing = dbData->pairingList[i];
			break;
		}
	}
}


void test_time_t() {

	//测试 time_t
	time_t t0 = 0;
	string str0 = utcToUtcString(t0);
	time_t t1 = utcStrToUtc((char*)str0.c_str());
	time_t t2 = utcToLocal(t1);
	time_t t3 = localToUtc(t2);
	time_t t4 = makeTimeT(1970, 1, 1, 0, 0, 0);
	printf("TEST time_t = %lld\n", t0);
	printf("         utcToUtcString = %s\n", str0.c_str());
	printf("         utcStrToUtc    = %lld\n", t1);
	printf("         utcToLocal     = %lld\n", t2);
	printf("         localToUtc     = %lld\n", t3);
	printf("         makeTimeT(1970-1-1)= %lld\n", t4);
}

void test_sharedptr() {
	CREW c;
	c.idCrew = "A";
	SharedPtr<CREW> c1(new CREW(c));

	printf("c:  0x%08x\n", &c);
	printf("c1: 0x%08x\n", c1.get());

}

void test_2d_array() {
	vector<string> rows = { "CA", "FO", "SO"};

	Index2DArray array2D;
	array2D.init(rows, rows);

	int value = 0;
	for (std::size_t i = 0; i < rows.size(); i++) {
		for (std::size_t j = 0; j < rows.size(); j++) {
			array2D.setValue(rows[i], rows[j], value++);
		}
	}

	cout << "array2D[CA, FO] = " << array2D.getValue("CA", "FO") << endl;

	array2D.printLog();

	cout << "test 2d array\n";
}


void test_map_bound() {

	std::map<char, int> mymap;
	std::map<char, int>::iterator itlow, itup;

	//mymap['a'] = 20;
	mymap['b'] = 40;
	//mymap['c'] = 60;
	mymap['d'] = 80;
	mymap['e'] = 100;

	auto itlowA = mymap.lower_bound('a');
	auto itlowC = mymap.lower_bound('c');
	itlow = mymap.lower_bound('c');  // itlow points to b
	itup = mymap.upper_bound('f');   // itup points to e (not d!)
	auto itlowF = mymap.lower_bound('f');
	auto rbeg = mymap.rbegin();
	auto rend = mymap.rend();

	if (itlow == mymap.end()) printf("itlow = end\n"); else printf("itlow = %c\n", itlow->first);
	if (itup == mymap.end()) printf("itup = end\n"); else printf("itup = %c\n", itup->first);
	if (itlowA == mymap.end()) printf("itlowA = end\n"); else printf("itlowA = %c\n", itlowA->first);
	if (itlowC == mymap.end()) printf("itlowC = end\n"); else printf("itlowC = %c\n", itlowC->first);
	if (itlowF == mymap.end()) printf("itlowF = end\n"); else printf("itlowF = %c\n", itlowF->first);
	if (rbeg == mymap.rend()) printf("rbeg = end\n"); else printf("rbeg = %c\n", rbeg->first);
	if (rend == mymap.rend()) printf("rend = end\n"); else printf("rend = %c\n", rend->first);

	auto end = mymap.end();
	end--;
	if (end == mymap.end()) printf("end = end\n"); else printf("end = %c\n", end->first);
	mymap.erase(itlow, itup);        // erases [itlow,itup)

	// print content:
	for (std::map<char, int>::iterator it = mymap.begin(); it != mymap.end(); ++it)
		std::cout << it->first << " => " << it->second << '\n';
}

void test_date_fmt() {
	int year = 0;
	int mon = 0;
	int mday = 0;
	stringstream ss;
	for (year = 2018; year < 2025; year++) {
		for (mon = 1; mon <= 12; mon++) {
			for (mday = 1; mday <= 31; mday++) {
				ss.str("");
				ss << year << "-" << mon << "-" << mday;
				string str = ss.str();
				cout << str << " : ";
				if (checkDateTimeStr(str.c_str()))
					cout << "OK\n";
				else
					cout << "ERROR\n";
			}
		}
	}
}

int getRestFacility(Segment* segment, CrewDataContext* dbData) {
	string tailNumber = segment->getTailNum();
	int ii = 0;
	if (dbData->fltIdToAircraftMap.find(tailNumber) != dbData->fltIdToAircraftMap.end()){
		DBAircraft* aircraft = dbData->fltIdToAircraftMap[tailNumber].get();
		if (aircraft->isExistRest){
			ii = aircraft->restFacility;
		}
	}
	else if (dbData->fleetMap.find(segment->getFleetCD()) != dbData->fleetMap.end()){
		FLEET fleet = dbData->fleetMap[segment->getFleetCD()];
		if (fleet.restfacility > ii){
			ii = fleet.restfacility;
		}
	}

	return ii;
}


int calculateDutyFdp(Duty* duty, string start, string end, CrewDataContext* dbData) {

	if (!duty) {
		return 0;//20190605 ain, mantis#5886, 增加参数保护
	}

	time_t fdpStart = 0, fdpEnd = 0;

	//从 duty.pairing_id定位 pairing对象
	Pairing* pairing = NULL;
	if (dbData->pairingIdMap.find(duty->getPairingId()) != dbData->pairingIdMap.end()) {
		pairing = dbData->pairingIdMap[duty->getPairingId()];
	}
	string pairingAssignment = pairing ? pairing->getPrimeActivity() : "FLY";
	int iBHAdj = pairing ? pairing->getBlockMinsAdjustment() * 60 : 0;


	//vector<SharedPtr<mandayTimes>> result;
	map<string, SharedPtr<ASSIGNMENT>>::iterator dbPairingAssignment = dbData->assignmentNameMap.find(pairingAssignment);

	//op#2246 计算seg pickup dropoff
	for (auto s : duty->getSegments()){
		RuleParams::GetInstancePtr()->calculateSegPickUpAndDropOff(s, &dbData->airportList);
	}
	//BLH / ACT_BLH

	//segment != FLY时 dp_end忽略debrief, 按末尾segment.end
	int numSegments = (int)duty->getNumSegments();
	Segment* lastSegment = duty->getLastSegment();
	//根据rule 2107计算 fdp.start/end
	//fdp/dp start
	fdpStart = duty->getFDPStartUtcTimes(dbData->assignmentNameGroupMap, start, calculateDutyBrief(duty, dbData));
	//fdp end
	if (dbData->scenario.airline != "BR")
	{
		fdpEnd = duty->getFDPEndUtcTimes(dbData->assignmentNameGroupMap, end);
		if (fdpEnd <= 0)
			fdpEnd = fdpStart;
	}
	else {
		Segment* lastFly = duty->getLastFlySegment();
		if (lastFly)
		{
			fdpEnd = lastFly->getEndTimeUtc(end);
		}
		else
		{
			fdpEnd = fdpStart;
		}
	}

	//FDP/ACT_FDP
	float fdpPct = (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->FDP_PCT : 1;
	if (fdpStart < fdpEnd)
	{
		long fdp = static_cast<long>((fdpEnd - fdpStart) * fdpPct);
		return fdp;
	}
	return 0;
}


void setDutyBrief(Duty* duty, CrewDataContext* dbData){
	int briefTime = 0;
	briefTime = calculateDutyBrief(duty, dbData);
	// mantis#6770, EVA沒有3021法規, 會造成同步pairing時briefing被清空
	if (briefTime > 0)
	{
		duty->setMinBrief(briefTime);
		duty->setActualBriefMin(briefTime);
	}
}
int calculateDutyBrief(Duty* duty, CrewDataContext* dbData){
	auto& dutyBuilder = dbData->getRuleFunctions(RULES::CHECK_IN_OUT_BRIEF);
	for (std::size_t i = 0; i < dutyBuilder.size(); i++){
		rule3021* cache = (rule3021*)dutyBuilder[i].parsedParam.get();
		string airport = cache->airport;
		int depStart = cache->depStart;
		int depEnd = cache->depEnd;
		string dutyType = cache->dutyType;
		vector<string> fltNumsVec = cache->fltNumsVec;
		vector<string> fleetsVec = cache->fleetsVec;
		vector<string> assignment = cache->assignment;
		int briefTime = cache->briefTime;

		Segment * seg = duty->getFirstSegment();

		//20190723 ain, mantis#6286, 容忍ptn/duty为空
		if (!seg) {
			continue;
		}

		if (airport != "*" && seg->getDepStation() != airport){
			continue;
		}
		int time = seg->getStartTimeLocAct() % (60 * 60 * 24);
		if (time < depStart || time > depEnd){
			continue;
		}
		if (dutyType != "*" && seg->getDomIntType() != dutyType){
			continue;
		}
		if (fltNumsVec[0] != "*" && find(fltNumsVec.begin(), fltNumsVec.end(), seg->getFlightNumber()) == fltNumsVec.end()){
			continue;
		}
		if (fleetsVec[0] != "*" && find(fleetsVec.begin(), fleetsVec.end(), seg->getFleetCD()) == fleetsVec.end()){
			continue;
		}
		if (assignment[0] != "*" && find(assignment.begin(), assignment.end(), seg->getAssignment()) == assignment.end()){
			continue;
		}
		return briefTime;
	}
	return 0;
}
