#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>
#include <math.h>

#include "CrewDBUtil.h"
#include "CrewDB.h"
#include "UtilFunc.h"
#include <OrLog.h>
#include "CustomBiz/CustomBiz.h"
#include "RuleParams.h"
#include "basicCalculation.h"
#include <sstream>
#include <fstream>
#include "UtilDbg.h"
#include "StringUtil.h"

#include "RuleInput.h"
#include "AllNewRule.h"
#include "RuleFactory.h"

#include "Log/Logger.h"
#include "utils/StringUtils.h"
#include "utils/TimeUtils.h"
#include "utils/RosterUtils.h"
#include "utils/DutyUtils.h"
#include "utils/SegmentUtils.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmPairingIndex.h"
#include "utils/TrainingCourseUtils.h"
#include "rule/rule7405/UlrDutyDefinition.h"
#include "PairingLabel/CalculatePairingLabelForSQ.h"
#include "../utils/PhaseUtils.h"

using namespace std;

///add by ain
atomic<long long> RULE_VIOLATION::instanceCount(0);
atomic<long long> RULE_COMPOSITION::instanceCount(0);
atomic<long long> RULE_LEGALITY::instanceCount(0);

string SPLIT_STRING = "|";

static long long dbg_t = 0;

#ifdef _WIN32
__declspec(dllexport)
#endif

extern long calculateDutyFdp(Duty* duty, CrewDataContext* dbData, CalculationManday FDP);

#ifdef __unix
#define printf_s printf
#endif
void printInstanceCount() {

	cout << "RULE_VIOLATION::instanceCount  = " << RULE_VIOLATION::instanceCount << endl;
	cout << "RULE_COMPOSITION::instanceCount  = " << RULE_COMPOSITION::instanceCount << endl;
	cout << "RULE_LEGALITY::instanceCount  = " << RULE_LEGALITY::instanceCount << endl;
}

string RULE_LEGALITY::toString() {
	stringstream ss;
	ss << "RULE_LEGALITY  crewIndex=" << crewIndex
		<< " pairingIndex=" << PairingIndex
		<< " rosterIndex=" << RosterIndex
		<< " isLegal=" << (isLegal ? "true" : "false");
	return ss.str(); 
}

bool RULE_COMPOSITION::operator == (const RULE_COMPOSITION& rhs) const{
	if ((name == rhs.name) && (priority == rhs.priority))
		return true;
	else
		return false;
}

bool RULE_COMPOSITION::operator!=(const RULE_COMPOSITION& rhs) const{
	if ((name == rhs.name) && (priority == rhs.priority))
		return false;
	else
		return true;
}

bool RULE_COMPOSITION::operator < (const RULE_COMPOSITION& rhs) const
{
	return (priority < rhs.priority);
}

bool RULE_COMPOSITION::isEqualToRankComposition(const map<string, int>& rankComposition, bool isFD)
{
	bool isEqual = true;

	if (rankComposition.size() == 0)
		return false;
	//if (rankComposition.size() != this->rankComposition.size())
	//	return false;

	vector<string>& fdRanks = RuleParams::GetInstancePtr()->fdRanks;

	for (auto& rank : rankComposition)
	{
		if (isFD)
		{
			if (std::find(fdRanks.begin(), fdRanks.end(), rank.first) == fdRanks.end())
				continue;
		}
		else
		{
			if (std::find(fdRanks.begin(), fdRanks.end(), rank.first) != fdRanks.end())
				continue;
		}
		map<string, int>::iterator it = this->rankComposition.find(rank.first);
		if (it == this->rankComposition.end())
			return false;
		{
			if (it->second != rank.second)
				return false;
		}
	}

	return isEqual;
}

static std::unordered_map<long long, std::tuple<int, int>> getDutyLimitsMap(const vector<RULE_LEGALITY*>& checkList, const SharedPtr<CrewDataContext>& dbData) {
	unordered_map<long long, tuple<int, int>> dutyLimitsMap;//map<dutyId, tuple<minRest,maxFDP>>
	unordered_set<int> crewIndexs;
	for (auto& ruleLegality : checkList) {
		if (ruleLegality->crewIndex < 0 || crewIndexs.find(ruleLegality->crewIndex) != crewIndexs.end()) {
			continue;
		}
		crewIndexs.insert(ruleLegality->crewIndex);
		const auto& crew = dbData->crewList[ruleLegality->crewIndex];
		if (crew == nullptr) {
			continue;
		}

		for (auto& roster : crew->rosterList) {
			if (roster->pairing == nullptr) {
				continue;
			}
			for (auto& duty : roster->pairing->getDutyVec()) {
				dutyLimitsMap.insert(std::make_pair(duty->getDutyId(), std::make_tuple(duty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST), duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP))));
			}
		}
	}

	return dutyLimitsMap;
}

static void setDutyLimitsMap(const std::unordered_map<long long, std::tuple<int, int>>& dutyLimitsMap, const vector<RULE_LEGALITY*>& checkList, const SharedPtr<CrewDataContext>& dbData) {

	unordered_set<int> crewIndexs;
	for (auto& ruleLegality : checkList) {
		if (ruleLegality->crewIndex < 0 || crewIndexs.find(ruleLegality->crewIndex) != crewIndexs.end()) {
			continue;
		}
		crewIndexs.insert(ruleLegality->crewIndex);
		const auto& crew = dbData->crewList[ruleLegality->crewIndex];
		if (crew == nullptr) {
			continue;
		}

		for (auto& roster : crew->rosterList) {
			if (roster->pairing == nullptr) {
				continue;
			}
			for (auto& duty : roster->pairing->getDutyVec()) {
				auto iter = dutyLimitsMap.find(duty->getDutyId());
				if (iter != dutyLimitsMap.end()) {
					auto& limits = iter->second;

					duty->setMinRest(std::get<0>(limits), true);
					limitaions* limit = duty->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
					if (limit != nullptr) {
						limit->value = std::get<0>(limits);
						//duty->setLimitationValue(limit->type, std::get<0>(limits), limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, true);
					}

					limit = duty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
					if (limit != nullptr) {
						limit->value = std::get<1>(limits);
						//duty->setLimitationValue(limit->type, std::get<1>(limits), limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, true);
					}
				}
			}
		}
	}
}

///add by ain
atomic<long long> LegalityChecker::instanceCount(0);

long long LegalityChecker::getInstanceCount() {
	return instanceCount;
}
////

void LegalityChecker::PrintRuleStatistics() 
{
	ofstream outputFile("RuleStatistics.txt", ios::out);
	if (!outputFile.good()) {
		//PI_LOG_CONSOLE_INFO("ERROR: open file {} failed\n", "RuleStatistics.txt");
		return;
	}

	//记录法规所用时间
	map<long long, clock_t> ruleStatisticsTime = this->getRuleTimeStat(); // RuleCalledStatisticsTime();
	outputFile << "------------ Rule Time ------------" << endl;
	for (auto& rs_time : ruleStatisticsTime)
		outputFile << rs_time.first << ": " << rs_time.second  << " micro seconds" << endl;
	outputFile << endl;

	//记录法规被调用次数
	map<long long, unsigned int> ruleStatisticsNum = this->getRuleCalledStat();
	outputFile << "------------ Rule Called Times ------------" << endl;
	for (auto& rs_num : ruleStatisticsNum)
		outputFile << rs_num.first << ": " << rs_num.second << endl;
	outputFile << endl;

	//记录法规被违规次数
	unordered_map<long long, int> ruleStatisticsViolated = this->getRuleViolatedStat();
	outputFile << "------------ Rule Violated Times ------------" << endl;
	for (auto& rs_violated : ruleStatisticsViolated)
		outputFile << rs_violated.first << ": " << rs_violated.second << endl;

	outputFile.close();
}

//初始化swapCrew, before=after=crew.rosterList, add=del=[empty]
SwapCrew::SwapCrew(SharedPtr<CREW>& crew) {
	this->crewId = crew->idCrew;
	this->swapCrew = crew;
	this->beforeRosters = crew->rosterList;
	this->afterRosters = crew->rosterList;
}

LegalityChecker::~LegalityChecker()
{
	if (_debug || this->_application == ROSTER_OPTIMIZER)
	{
		ofstream outFile("output_rules.txt");
		for (std::size_t i = 0; i < _appRules.size(); i++) {
			outFile << _appRules[i].idRule << "\n";
		}
		outFile.close();
	}

	vector<RULE_VIOLATION*> violations = this->_rule_violations;
	std::for_each(violations.begin(), violations.end(), std::default_delete<RULE_VIOLATION>());

	//if (custRules) delete custRules;
	//custRules = NULL;

	instanceCount--;
}
LegalityChecker::LegalityChecker(int iApplication, bool bDebug) {
	_application = iApplication;
	_debug = bDebug;
	_ctx = { 0 };
	_dbCtx = { 0 };
	//121.40.48.189
	_connStr = "121.40.48.189:10000/orcl";
	//_username = "ca_app";
	//_passwordStr = "ca_app";
	_username = "picrew";
	_passwordStr = "PICREW05P36";
	//if (custRules == NULL)
	//{
	//	custRules = new CustomLegality();
	//}

	/*
	国航独有逻辑，暂时Hardcode
	RTEW > RTEE > RTES > RTWW > RTWS > RTAW > RTAS
	PPL1 > PPL2 > PPL3 > PPL4 > PPL5
	*/
	_reportQuals= std::unordered_map<string, int>({{"RTEW", 1},{"RTEE",  2},{"RTES",  3},{"RTWW", 4},{"RTWS", 5},{"RTAW", 6},{"RTAS", 7}});
	_airportQuals = std::unordered_map<string, int>({ {"PPL1", 1},{"PPL2",  2},{"PPL3",  3},{"PPL4", 4},{"PPL5", 5}});

	instanceCount++;
}

void LegalityChecker::addPgToCheckList() {
	if (_dbData->pairingList.size() > 1){
		_pgCheckList.push_back(_dbData->pairingList[0]);
		_pgCheckList.push_back(_dbData->pairingList[1]);
	}
}

void LegalityChecker::addPairingToCheckList(Pairing* _pg){ _pgCheckList.push_back(_pg); }


std::size_t LegalityChecker::getRuleSize(){ return _dbData->ruleList.size(); }

map<long long, unsigned int> LegalityChecker::getRuleCalledStat()
{ 
	return RuleStatistics::GetInstancePtr()->getRuleCalledTimes(); 
};

unordered_map<long long, int> LegalityChecker::getRuleViolatedStat(){ return RuleStatistics::GetInstancePtr()->getRuleViolatedTimes(); };
//return the clock of rule called
map<long long, clock_t> LegalityChecker::getRuleTimeStat(){ return RuleStatistics::GetInstancePtr()->getRuleCalledClock(); };
SharedPtr<CrewDataContext> LegalityChecker::getDataContext() { return _dbData; };
vector<RULE_COMPOSITION>* LegalityChecker::getCompositionDefinition(){ return &_composition; };
//设置Rule Window Range
void LegalityChecker::setRuleWindowRange(time_t start, time_t end) { _window_start = start; _window_end = end; };
int LegalityChecker::getCallCount(){ return callCount; };
SharedPtr<CrewDataContext> LegalityChecker::getCrewContext() { return _dbData; };

int LegalityChecker::GetApplication() { return _application; };
void LegalityChecker::setApplication(int iAppID){ _application = iAppID; };

vector<string> LegalityChecker::getViolations() { return _violations; };

void LegalityChecker::setRuleSet(string strRuleSetID) { _RuleSetID = strRuleSetID; };

string LegalityChecker::getRuleSet(){ return _RuleSetID; };

vector<RULE_VIOLATION*> LegalityChecker::getRuleViolations(){
	return	_rule_violations;
};
vector<string> LegalityChecker::getViolationMessages(){ return this->_violations; };


bool LegalityChecker::DebugMode() const { return _debug; };
void LegalityChecker::addViolations(string msg) { _violations.push_back(msg); };
////

using namespace std;

bool cmpFD(SharedPtr<CREW_MANDAY_FD> m1, SharedPtr<CREW_MANDAY_FD> m2)  {
	return m1->crewDateUtc < m2->crewDateUtc;
}
bool cmpCC(SharedPtr<CREW_MANDAY_CC_AM> m1, SharedPtr<CREW_MANDAY_CC_AM> m2)  {
	return m1->crewDateUtc < m2->crewDateUtc;
}

bool cmpComposition(RULE_COMPOSITION m1, RULE_COMPOSITION m2)  {
	return m1.priority < m2.priority;
}

bool cmp(WORKDUTY_TIMES * m1, WORKDUTY_TIMES * m2)  {
	return m1->startUtcTime < m2->startUtcTime;
}

bool ruleCmp(DBRule m1, DBRule m2)
{
	int m1Violated = 0, m2Violated = 0;
	unsigned int m1Called = 9999, m2Called = 9999;

	unordered_map<long long, int> ruleViolations = RuleStatistics::GetInstancePtr()->getRuleViolatedTimes();
	map<long long, unsigned int> ruleCallNums = RuleStatistics::GetInstancePtr()->getRuleCalledTimes();

	unordered_map<long long, int>::iterator l_it = ruleViolations.find(m1.idRule);
	if (l_it != ruleViolations.end())
		m1Violated = (*l_it).second;

	l_it = ruleViolations.find(m2.idRule);
	if (l_it != ruleViolations.end())
		m2Violated = (*l_it).second;

	map<long long, unsigned int>::iterator calledTemNum=ruleCallNums.find(m1.idRule);
	if (calledTemNum != ruleCallNums.end())
		m1Called = (*calledTemNum).second;

	calledTemNum = ruleCallNums.find(m2.idRule);
	if (calledTemNum != ruleCallNums.end())
		m2Called = (*calledTemNum).second;

	if (m1Called <= 0)
		m1Called = 2130150000;
	if (m2Called <= 0)
		m2Called = 2130150000;

	return (m1Violated/ m1Called) > (m2Violated/ m2Called);
}



bool block_cmp(const DBRule& rule1, const DBRule& rule2)
{
	auto& parameter1 = rule1.params;
	map<string, string>::const_iterator iter;
	string header, headValue;
	string value1, value2;
	for (iter = parameter1.begin(); iter != parameter1.end(); ++iter)
	{
		header = iter->first;
		headValue = iter->second;
		if (header == "MAX BLH")
		{
			value1 = headValue;
			break;
		}
	}

	int blh1 = hhmmToMinutes(value1.c_str());

	auto& parameter2 = rule2.params;
	for (iter = parameter2.begin(); iter != parameter2.end(); ++iter)
	{
		header = iter->first;
		headValue = iter->second;
		if (header == "MAX BLH")
		{
			value2 = headValue;
			break;
		}
	}
	int blh2 = hhmmToMinutes(value2.c_str());
	return blh1 < blh2;
}

bool fdp_cmp(const DBRule& rule1, const DBRule& rule2)
{
	auto& parameter1 = rule1.params;
	map<string, string>::const_iterator iter;
	string header, headValue;
	string value1, value2;
	for (iter = parameter1.begin(); iter != parameter1.end(); ++iter)
	{
		header = iter->first;
		headValue = iter->second;
		if (header == "MAX FDP")
		{
			value1 = headValue;
			break;
		}
	}
	int fdp1 = hhmmToMinutes(value1.c_str());

	auto& parameter2 = rule2.params;
	for (iter = parameter2.begin(); iter != parameter2.end(); ++iter)
	{
		header = iter->first;
		headValue = iter->second;
		if (header == "MAX FDP")
		{
			value2 = headValue;
			break;
		}
	}
	int fdp2 = hhmmToMinutes(value2.c_str());
	return fdp1 < fdp2;
}



void LegalityChecker::setDBConnectionString(string connection, string user, string password){
	this->_connStr = connection;
	this->_username = user;
	this->_passwordStr = password;
}

static long long dbg_t1 = 0;
static long long dbg_t2 = 0;
static long long dbg_t3 = 0;

void LegalityChecker::initialRules(vector<SharedPtr<ROSTER>> rosters)
{

	for (size_t iRoster = 0; iRoster < rosters.size(); iRoster++)
	{
		string roster_type = rosters[iRoster]->duty;


		if (!(rosters[iRoster]->pairing))
			continue;
		Pairing* pg = rosters[iRoster]->pairing;
		vector<Duty *> dutylist = pg->getDutyVec();

		long long pgId = pg->getDbId();

		// 7481 RED_EYE_DEFINITION_FOR_HX
		setRedEyeDutyForHX(pg);

		//set  easa state:7000/7025
		//setAcclimationState(dutylist);
		setAcclimationStateOfEASA(pg);
		setAcclimationStateByLocalNights(dutylist);
		// 7400 ANR acclimatisation
		setAcclimationStateOfANR(pg);
		setSplitDuty(dutylist);

		//QQ 6005
		//setAcclimationState_QQ(pg);
		// 7482 ACCLIMATISATION_DEFINITION_FOR_HX
		setAcclimationStateForHX(pg);

		// 7500 ACCLIMATISATION_DEFINITION_FOR_CARS
		setAcclimationStateForCARS(pg);

		if (pg->isInitialized())
			continue;

		if (roster_type == "FLY")
		{
			for (size_t iDuty = 0; iDuty < dutylist.size(); iDuty++)
			{
				Duty * duty = dutylist[iDuty];
				Duty::DUTY_TYPE dt = duty->getType();
				if (dt == Duty::DUTY_BLANK_DAY || dt == Duty::DUTY_PAIRING_REST){
					continue;
				}
				//op#2163 移除duty 五件套初始化
				//setDutyBuilderReq(duty);
				//mantis#5082 在每次进行Brief/deBrief/pickUp/dropOff赋值前 先计算DomIntype
				//op#2128 setDirection		
				if (pg->getDivision() == "P"){
					calculateMaxFlightDutyPeriod_QQ(duty, rosters[iRoster]);
					calculateMaxFlightDutyPeriod_ANR(duty, rosters[iRoster]);
					calculateMaxFlightDutyPeriod_HX(duty, rosters[iRoster]);
					//setDutyDiscretion_R5(duty);
					//setDutyDiscretion_R4(duty);
				}
				else{
					setDutyDiscretion_2030(duty);
				}
				//6006 QQ设置机场休息设施
				setAirportRestFacilty_QQ(duty);

				// 6107 QQ计算maxFDP for CC 根据配置，不配置则不计算
				calculateMaxFlighTime_QQ_CC(duty);

				//3007 MAX_FDP_PERDUTY 设置Max FDP
				setFDPPerDutyByDuty(duty);

				//6020 QQ计算MaxFDP by Split Duty
				setMaxFlightDutyBySplitDuty_QQ(duty);
				/*duty->setDomIntType(Utility::GetInstancePtr()->getDutySegType(duty, &(this->_dbData->airportList)));
				setDutyBrief(duty);
				setDutyDebrief(duty);
				setDutyPickup(duty);
				setDutyDropoff(duty);*/
				//checkMinConnBetwDIP(duty);
				//6025 LIMIT_MAX_DP_QQ
				calculateMaxDP_QQ(duty);

				//7028 TG 计算FDP Extension
				calculateSplitDutyMaxFDPExtension_TG(duty);

				//7017 TG CC 计算FTP扩展
				calculateMaxFDPExtension_TG_CC(duty);

				//7407 5J 计算Max FDP和Extension
				calculateDutyFdpAndExtensionFor5J(duty);

				calculateMaxFlightDutyPeriod_HX(duty);

				apply3021MaxFdpBriefDelta(duty, pg->getBase());

				//7029 TG CC FDP Extension with in-flight rest
				calculateFdpExtensionWithInFlightRestOfCcForTG(duty);
			}

		}
		setULR(pg);
		//pg->setInitialIndicator(true);
	}
}

// This is the constructor of a class that has been exported.
// see RuleEngine.h for the class definition
void LegalityChecker::initializeDB(long long scenarioId)
{
	SharedPtr<CrewDataContext> dbData = make_shared<CrewDataContext>();

	//char * connStr = new char[100];
	//char * username = new char[100];
	//char * password = new char[100];

	//if (!(_connStr.length()))
	//	_connStr = "121.40.48.189:10000/orcl";
	//if (!(_username.length()))
	//	_username = "CREW_TEST_07";
	//if (!(_passwordStr.length()))
	//	_passwordStr = "ROIS07";
	//strcpy(connStr, _connStr.c_str());
	//strcpy(username, _username.c_str());
	//strcpy(password, _passwordStr.c_str());
	////
	////测试：创建数据库连接
	////
	//makeDBConnection(&_dbCtx, connStr, username, password);
	//if (_dbCtx.errorCode != DB_SUCCESS) 
	//{
	//	printf("make conn failed : (0x%08x) %s\n", _dbCtx.errorCode, _dbCtx.errorMsgBuf);
	//	rule_err_handler(_dbCtx.errorCodeOCI);
	//}

	//Scenario _scenario = getScenario(&_dbCtx, scenarioId);
	//this->_scenarioID = scenarioId;
	//dbData->loadData(&_dbCtx, scenarioId, _scenario.startDtUTC, _scenario.endDtUTC, false, _scenario.crewBases, _scenario.bases, _scenario.fleets, _scenario.ranks);
	dbData->loadData(scenarioId);
	setRuleWindowRange(dbData->scenario.startDtUTC, dbData->scenario.endDtUTC);

	if (_dbCtx.errorCode != DB_SUCCESS)
	{
		//rule_err_handler(_dbCtx.errorCodeOCI);
		Logger::getRuleLogger()->error("ERROR-MSG: {}", _dbCtx.errorMsgBuf);
	}
	if (_debug)
		Logger::getRuleLogger()->info("Starting to prepare data for rule checking");

	setDataContext(dbData);
}


/*progress为进度百分比，取值为0~100, last_char_count为上一次显示进度条时所用到的字符个数*/
int display_progress(int progress, int last_char_count)
{
	int i = 0;

	/*把上次显示的进度条信息全部清空*/
	for (i = 0; i < last_char_count; i++)
	{
		printf("\b");
	}

	/*此处输出‘=’，也可以是其他字符，仅个人喜好*/
	for (i = 0; i < progress; i++)
	{
		printf("=");
	}
	printf(">>");
	/*输出空格截止到第104的位置，仅个人审美*/
	for (i += 2; i < 104; i++)
	{
		printf(" ");
	}
	/*输出进度条百分比*/
	// i = i + printf_s("[%d%%]", progress);
	printf("[%d%%]", progress);
	i = i + (int)to_string(progress).length() + 3;
	/*此处不能少，需要刷新输出缓冲区才能显示，
	这是系统的输出策略*/
	fflush(stdout);

	/*返回本次显示进度条时所输出的字符个数*/
	return i;
}

//setDataContext和initializeDB二选一
void LegalityChecker::setDataContext(SharedPtr<CrewDataContext> data, const long long ruleSetId, const bool isCalc)
{
	_dbData = data;
	if (this->_dbData->isServiceMode()) {
		RuleParams::setDivision(this->_dbData->scenario.division);
	}
	this->completePairingDutySegTimeByFlight(data, data->pairingList);
	if (ruleSetId == -1) {
		_appRules = filterRules(this->_dbData->ruleList, this->GetApplication());
	}
	else {
		_appRules = filterRules(ruleSetId, this->_dbData->ruleSetList, this->_dbData->allRuleList, this->GetApplication());
	}
	this->_dbData->clearRuleList();

	_ruleFactory = std::make_unique<RuleFactory>(*this);
	//mantis#2074, 增加 func分类索引
	std::set<long long> ruleIds;
	for (auto& item : _appRules) {
		ruleIds.emplace(item.idRule);
		int func = item.function;
		_dbData->addRuleFunction(func, item);
	}
	Logger::getRuleLogger()->debug("initRule ruleSetId:{}, ruleId size:{}, list:{}", ruleSetId, ruleIds.size(), StringUtils::Join(ruleIds, ","));
	initRule();
	if (!isCalc) {
		return;
	}
	//20181219 mantis#4642 3010重构 添加 ruleEngine对象
	auto& rule3010 = this->_dbData->getRuleFunctions(RULES::CHECK_IN_OUT);
	if (!rule3010.empty()){
		vector<map<string, string>> parameters;
		for (auto& rule : rule3010){
			parameters.push_back(rule.params);
		}
		rule3010Calculator.init(rule3010[0].idRule, parameters);
	}
	//this->pairingCompositionCalculator = new PairingCompositionCalculator(_dbData->scenario.airline, _dbData->scenario.division, _dbData->ruleList, _dbData->fleetList, _dbData->compositionList, _dbData->compositionRankMap, _dbData->rankList, _dbData->fltIdToAircraftMap);
	setCompositionDefinition();
	_dbData->mandayForRosterCalculator = this;
	RuleParams::GetInstancePtr()->loadRuleParams(this->_dbData);
	RuleParams::GetInstancePtr()->loadAssignments(this->_dbData->rule_8014, this->_dbData->scenario.airline);
	RuleParams::GetInstancePtr()->setApplication(this->_application);
	_scenarioID = _dbData->scenarioId;
	setRuleWindowRange(_dbData->scenario.startDtUTC, _dbData->scenario.endDtUTC);
	RuleStatistics::GetInstancePtr()->initRankList(this->_dbData->rankList, this->_dbData->scenario.airline);

	//建立flight对应pairing的索引
	//2007/2008/3007/3008/2030所需
	_dbData->makeSegmentToPairingMap();
	//20181211 ain, mantis#4609, 初始化ruleEngine增加pairing/duty数值计算
	time_t currTime = Utility::GetInstancePtr()->getCurrentTimeInUTC(_dbData);
	for (auto& p : _dbData->pairingList) {
		_dbData->calcuateRulePhases(p, currTime);
		this->calculatePairingFdpRest(p);
	}
	//mantis#2119, manday计算按场景时间计算

	vector<SharedPtr<CREW>>& crews = this->_dbData->crewList;

	int iProgress = 0;
	Logger::getRuleLogger()->info("calculateManday start crewList.size={} division={}", _dbData->crewList.size(), _dbData->scenario.division.c_str());
	
	//2030 _fleetNameMap _compositionNameMap组建
	this->_fleetNameMap.clear();
	this->_compositionNameMap.clear();
	for (auto fleet : _dbData->fleetList){
		this->_fleetNameMap.insert(make_pair(fleet.fleet, fleet.displayOrder));
	}
	for (auto composition : _dbData->compositionList){
		this->_compositionNameMap.insert(make_pair(composition.getCompositionId(), composition.getName()));
	}
	//for (vector<SharedPtr<CREW>>::iterator it = crews->begin(); it != crews->end(); ++it)
	BasicCalculation* calc = new BasicCalculation(this->_dbData);
	calc->setRuleEngine(this);
	for (auto& crew : crews)
	{
		//if (crew->idCrew == "D93382")
		//	printf("");
		if ((this->_debug) && crew->idCrew != this->_debugCrewId && this->_debugCrewId != "")
			continue;
		
		calculateInexperiencedCrewFor5J(crew);

		_dbData->calcuateRulePhases(crew, currTime);
		calc->calculateCommute(crew);

		//mantis#2764, 修正排序靠前crew计算manday reset范围影响后续crew reset范围造成manday数据丢失
		time_t start = this->_dbData->scenario.startDtUTC;
		time_t end = this->_dbData->scenario.endDtUTC;

		//mantis#2294, 统一manday计算接口
		//mantis#1815, reCalculateCrewManday()保留历史manday，不再按mantis#2294方式统一
		//mantis#2438, 为兼容历史manday数据缺失, 重算manday时间范围在scenario.start/end基础上扩展为roster覆盖日期段
		//matnis#2507, 增加rosterList为空判断
		if (!crew->rosterList.empty()) {
			auto& firstRoster = crew->rosterList[0];
			auto& lastRoster = crew->rosterList[crew->rosterList.size() - 1];
			if (firstRoster->actStrUtc < start) {
				int offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(firstRoster->actStrUtc);
				start = getLocalDayStartInUTC(firstRoster->actStrUtc, offsetMinutes);
			}
			if (lastRoster->actEndUtc > end) {
				int offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(lastRoster->actEndUtc);
				end = getLocalDayStartInUTC(lastRoster->actEndUtc, offsetMinutes);
			}
		}
		/*bool bReturnValue = this->reCalculateCrewManday(crew, start, end);
		if ((!bReturnValue) && (_debug))
			printf("ERROR-In Crew Manday re-calculation.\n");*/

		initialRules(crew->rosterList);
		iProgress++;

		Utility::GetInstancePtr()->progressBar((100 * iProgress) / (int)crews.size());

	}
	//calc->clearCAFaireHistoryData(this->_dbData);
	//calc->calcualteCrewsStatistics(this, this->_dbData);
	delete calc;
	calc = NULL;

	cout << endl;
	Logger::getRuleLogger()->info("calculateManday by reCalculateCrewManday end");

	calNumOfDowngradeInAScenario(this->_dbData);
	calNumOfPatternInAScenario(this->_dbData);

	//7321 TASK_ONLY_OPERATED_FILTERED_CREW_FOR_PR 法规数据初始化
	initTaskOnlyBeOperatedByFilteredCrewCacheForPR(this->_dbData);

	RuleStatistics::GetInstancePtr()->sortPatternList();
	//int ii = RuleStatistics::GetInstancePtr()->getActualPatternInScenario("8073001|1|1");
	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); assign++)
	{
		//
		if ((*assign)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assign)->airline == this->_dbData->scenario.airline))
			_restAssignments.push_back((*assign)->assignemnt);
	}
	//custRules->setData(this->_application, this->_dbData);
	Logger::getRuleLogger()->info("Start Rule Engine.......");
	Logger::getRuleConsoleLogger()->info("Start Rule Engine.......");
};

void LegalityChecker::setRuleSet(const long long ruleSetId) {
	_appRules = filterRules(ruleSetId, this->_dbData->ruleSetList, this->_dbData->allRuleList, this->GetApplication());
	_dbData->getRuleFuncList().clear();
	_ruleFactory = std::make_unique<RuleFactory>(*this);
	//mantis#2074, 增加 func分类索引
	for (auto& item : _appRules) {
		int func = item.function;
		_dbData->addRuleFunction(func, item);
	}
	initRule();
}

void LegalityChecker::initRule() {

	{
		//general rule
		RuleAlias::CHECKRULE0000::InputType ruleInput;
		ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::GENERAL_LIMIT);
		_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE0000>(std::move(ruleInput));
	}

	{
		//calc manual limit rule
		RuleAlias::CALCRULE2001::InputType ruleInput;
		ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALC_MANUAL_LIMIT);
		_ruleFactory->InitCalcRule<RuleAlias::CALCRULE2001>(std::move(ruleInput));
	}

	std::set<int> functions;
	for (auto& function : _dbData->getRuleFuncList()) {
		functions.emplace(function);

		// 3003
		if (function == RULES::LIMIT_DEP_OR_ARR_STATION_FOR_PAIRING) {
			RuleAlias::CHECKRULE3003::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE3003>(std::move(ruleInput));
		}

		// 6005
		if (function == RULES::ALLIANCE_ACCLIMATISATION_DEFINITION) {
			RuleAlias::CALCRULE6005::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::ALLIANCE_ACCLIMATISATION_DEFINITION);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6005>(std::move(ruleInput));
		}
		// 6006
		if (function == RULES::CALC_AIRPORT_REST_FACILTY) {
			RuleAlias::CALCRULE6006::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CALCRULE6006>(std::move(ruleInput));
			RuleAlias::CALCRULE6006::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6006>(std::move(calcRuleInput));
		}
		// 6007
		if (function == RULES::MAX_FLIGHT_DUTY_PERIOD_QQ) {
			RuleAlias::CHECKRULE6007::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6007>(std::move(ruleInput));
			RuleAlias::CALCRULE6007::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6007>(std::move(calcRuleInput));
		}
		// 7410 ANR FDP limit (+ 7411 sector counting definition)
		if (function == RULES::ANR_MAX_FLIGHT_DUTY_PERIOD) {
			auto anrFdpRules = this->_dbData->getRuleFunctions(RULES::ANR_MAX_FLIGHT_DUTY_PERIOD);
			auto sectorCountRules = this->_dbData->getRuleFunctions(RULES::ANR_SECTOR_COUNTING_DEFINITION);
			auto ccAugmentedMaxFdpRules = this->_dbData->getRuleFunctions(RULES::ANR_CC_AUGMENTED_MAX_FDP_LIMIT);

			RuleAlias::CHECKRULE7410::InputType ruleInput;
			ruleInput.dbRules = anrFdpRules;
			if (!sectorCountRules.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ANR_SECTOR_COUNTING_DEFINITION, sectorCountRules);
			}
			if (!ccAugmentedMaxFdpRules.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ANR_CC_AUGMENTED_MAX_FDP_LIMIT, ccAugmentedMaxFdpRules);
			}
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7410>(std::move(ruleInput));

			RuleAlias::CALCRULE7410::InputType calcRuleInput;
			calcRuleInput.dbRules = anrFdpRules;
			if (!sectorCountRules.empty()) {
				calcRuleInput.dependDbRules.emplace(RULES::ANR_SECTOR_COUNTING_DEFINITION, sectorCountRules);
			}
			if (!ccAugmentedMaxFdpRules.empty()) {
				calcRuleInput.dependDbRules.emplace(RULES::ANR_CC_AUGMENTED_MAX_FDP_LIMIT, ccAugmentedMaxFdpRules);
			}
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7410>(std::move(calcRuleInput));
		}
		// 7414 ANR consecutive special duty rest requirement
		if (function == RULES::ANR_CONSECUTIVE_SPECIAL_DUTY) {
			RuleAlias::CHECKRULE7414::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::ANR_CONSECUTIVE_SPECIAL_DUTY);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7414>(std::move(ruleInput));
		}
		// 7415 ANR consecutive working day limit between days off
		if (function == RULES::ANR_DAY_OFF_SPACING) {
			auto spacingRules = this->_dbData->getRuleFunctions(RULES::ANR_DAY_OFF_SPACING);
			auto dayOffDefinition = this->_dbData->getRuleFunctions(RULES::ANR_DAY_OFF_DEFINITION);

			RuleAlias::CHECKRULE7415::InputType ruleInput;
			ruleInput.dbRules = spacingRules;
			if (!dayOffDefinition.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ANR_DAY_OFF_DEFINITION, dayOffDefinition);
			}
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7415>(std::move(ruleInput));
		}
		// 7416 ANR minimum days off in consecutive periods
		if (function == RULES::ANR_MIN_DAYS_OFF_IN_PERIOD) {
			auto minDaysRules = this->_dbData->getRuleFunctions(RULES::ANR_MIN_DAYS_OFF_IN_PERIOD);
			auto dayOffDefinition = this->_dbData->getRuleFunctions(RULES::ANR_DAY_OFF_DEFINITION);

			RuleAlias::CHECKRULE7416::InputType ruleInput;
			ruleInput.dbRules = minDaysRules;
			if (!dayOffDefinition.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ANR_DAY_OFF_DEFINITION, dayOffDefinition);
			}
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7416>(std::move(ruleInput));
		}
		// 7417 ANR reporting + debrief minimum requirements
		if (function == RULES::ANR_MIN_REPORTING_DEBRIEF) {
			RuleAlias::CHECKRULE7417::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::ANR_MIN_REPORTING_DEBRIEF);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7417>(std::move(ruleInput));
		}
		// 7420 SQ CA ACOP FDP pattern (Table A)
		if (function == RULES::SQ_CA_ACOP_FDP_PATTERN_TABLE_A) {
			RuleAlias::CHECKRULE7420::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7420>(std::move(ruleInput));
		}
		// 7421 SQ CA ACOP slip pattern (Template B)
		if (function == RULES::SQ_CA_ACOP_SLIP_PATTERN_TABLE_B) {
			RuleAlias::CHECKRULE7421::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			const auto ulrDefinition = this->_dbData->getRuleFunctions(RULES::ANR_ULR_DUTY_DEFINITION);
			if (!ulrDefinition.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ANR_ULR_DUTY_DEFINITION, ulrDefinition);
			}
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7421>(std::move(ruleInput));
		}
		// 7422 SQ CA ATDO after slip on return to base
		if (function == RULES::SQ_CA_ATDO_AFTER_SHORT_SLIP_AT_CAI_IST) {
			RuleAlias::CALCRULE7422::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7422>(std::move(calcRuleInput));
		}
		// 7423 SQ post-ULR minimum rest at base
		if (function == RULES::SQ_CA_POST_ULR_REST_AT_BASE) {
			RuleAlias::CALCRULE7423::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7423>(std::move(calcRuleInput));
		}
		// 7424 SQ overnight arrival ATDO at base
		if (function == RULES::SQ_CA_OVERNIGHT_ATDO_AT_BASE) {
			RuleAlias::CALCRULE7424::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7424>(std::move(calcRuleInput));
		}
		// 7434 CA max duty period with trailing deadhead
		if (function == RULES::SQ_CA_MAX_DUTY_PERIOD_WITH_TRAILING_DEADHEAD) {
			RuleAlias::CHECKRULE7434::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7434>(std::move(ruleInput));
		}
		// 7435 CA ULR pairing minimum days
		if (function == RULES::SQ_CA_ULR_PAIRING_MIN_DAYS) {
			RuleAlias::CHECKRULE7435::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7435>(std::move(ruleInput));
		}
		//7450
		if (function == RULES::SQ_CA_FDP_SECTOR_LIMIT) {
			RuleAlias::CHECKRULE7450::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7450>(std::move(ruleInput));
		}
		//7451 SQ operational coterminal-duty connection restriction
		if (function == RULES::RESTRICT_COTERMINAL_DUTY_CONNECTION_FOR_SQ) {
			RuleAlias::CHECKRULE7451::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7451>(std::move(ruleInput));
		}
		//7452 SQ ULR/FDP classification mismatch check
		if (function == RULES::SQ_CA_ULR_FDP_CLASSIFICATION_MISMATCH) {
			RuleAlias::CHECKRULE7452::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7452>(std::move(ruleInput));
		}
		//7453 SQ same-city requirement around ULR duties in COP
		if (function == RULES::SQ_CA_SAME_CITY_AROUND_ULR_DUTY) {
			RuleAlias::CHECKRULE7453::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7453>(std::move(ruleInput));
		}
		// 6008
		if (function == RULES::FDP_AND_FT_DISCRETION_FOR_FD_QQ) {
			RuleAlias::CHECKRULE6008::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6008>(std::move(ruleInput));

			RuleAlias::CALCRULE6008::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6008>(std::move(calcRuleInput));
		}
		// 6009
		if (function == RULES::FDP_AND_FT_DISCRETION_FOR_CC_QQ) {
			RuleAlias::CHECKRULE6009::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6009>(std::move(ruleInput));

			RuleAlias::CALCRULE6009::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6009>(std::move(calcRuleInput));
		}
		// 6010
		if (function == RULES::LIMIT_BEFORE_ANNUAL_LEAVE) {
			RuleAlias::CHECKRULE6010::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::LIMIT_BEFORE_ANNUAL_LEAVE);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6010>(std::move(ruleInput));
		}
		// 6011
		if (function == RULES::CHECK_MIN_REST_BETWEEN_CONSECUTIVE_DAYS) {
			RuleAlias::CHECKRULE6011::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST_BETWEEN_CONSECUTIVE_DAYS);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6011>(std::move(ruleInput));
		}
		// 6018
		if (function == RULES::LIMIT_LONG_TRANSIT) {
			RuleAlias::CHECKRULE6018::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6018>(std::move(ruleInput));
		}
		// 6019
		if (function == RULES::LIMIT_TRANSIT_AND_LAYOVER) {
			RuleAlias::CHECKRULE6019::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6019>(std::move(ruleInput));
		}
		// 6020
		if (function == RULES::MAX_FLIGHT_DUTY_BY_SPLIT_DUTY) {
			RuleAlias::CALCRULE6020::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MAX_FLIGHT_DUTY_BY_SPLIT_DUTY);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6020>(std::move(ruleInput));

			RuleAlias::CHECKRULE6020::InputType checkRuleInput;
			checkRuleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MAX_FLIGHT_DUTY_BY_SPLIT_DUTY);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6020>(std::move(checkRuleInput));

			RuleAlias::CALCINTRULE6020::InputType intRuleInput;
			intRuleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MAX_FLIGHT_DUTY_BY_SPLIT_DUTY);
			_ruleFactory->InitCalcRule<RuleAlias::CALCINTRULE6020>(std::move(intRuleInput), "INT");
		}
		// 6021
		if (function == RULES::LIMIT_AIRCRAFT_CHANGE) {
			RuleAlias::CHECKRULE6021::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6021>(std::move(ruleInput));
		}
		//6022
		if (function == RULES::CALC_FDP_FOR_DELAYED_FLIGHT) {
			RuleAlias::CALCRULE6022::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6022>(std::move(ruleInput));
		}
		//6024
		if (function == RULES::CALC_MAX_FDP_FOR_STANDBY_QQ) {
			RuleAlias::CALCRULE6024::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6024>(std::move(ruleInput));
		}
		//6025
		if (function == RULES::LIMIT_MAX_DP_QQ) {
			RuleAlias::CHECKRULE6025::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6025>(std::move(ruleInput));

			RuleAlias::CALCRULE6025::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6025>(std::move(calcRuleInput));
		}
		//6026
		if (function == RULES::LIMIT_FLEET_FOR_STANDBY_QQ) {
			RuleAlias::CHECKRULE6026::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6026>(std::move(ruleInput));
		}
		// 6032
		if (function == RULES::CHECK_CONSECUTIVE_WOCL_DUTY) {
			RuleAlias::CHECKRULE6032::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_CONSECUTIVE_WOCL_DUTY);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6032>(std::move(ruleInput));
		}
		// 6033
		if (function == RULES::CHECK_CONSECUTIVE_EARLY_DUTY) {
			RuleAlias::CHECKRULE6033::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_CONSECUTIVE_EARLY_DUTY);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6033>(std::move(ruleInput));
		}
		//6034
		if (function == RULES::CHECK_MAX_EARLY_DUTY_IN_ANY_CONSECUTIVE_DAY) {
			RuleAlias::CHECKRULE6034::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_EARLY_DUTY_IN_ANY_CONSECUTIVE_DAY);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6034>(std::move(ruleInput));
		}
		//6035
		if (function == RULES::CHECK_MAX_CONSECUTIVE_NIGHTS_AWAY_FROM_BASE) {
			RuleAlias::CHECKRULE6035::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_CONSECUTIVE_NIGHTS_AWAY_FROM_BASE);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6035>(std::move(ruleInput));
		}
		//6036
		if (function == RULES::CHECK_WORKING_DAYS_LIMIT) {
			RuleAlias::CHECKRULE6036::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_WORKING_DAYS_LIMIT);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6036>(std::move(ruleInput));
		}
		//6037
		if (function == RULES::CHECK_FLIGHT_DHD_LIMIT) {
			RuleAlias::CHECKRULE6037::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_FLIGHT_DHD_LIMIT);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6037>(std::move(ruleInput));
		}
		//6038 Added by Aspen on 2024.08.06 for checking if max consecutive FDP reached in one pairing with UNKNOW acc state then set Adaption period as min rest 
		if (function == RULES::CHECK_ADAPTION_PERIOD_4_MAX_CONSECUTIVE_FDP) {
			RuleAlias::CHECKRULE6038::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_ADAPTION_PERIOD_4_MAX_CONSECUTIVE_FDP);
			ruleInput.dependDbRules.insert(std::make_pair(RULES::ALLIANCE_ACCLIMATISATION_DEFINITION, this->_dbData->getRuleFunctions(RULES::ALLIANCE_ACCLIMATISATION_DEFINITION)));
			_ruleFactory->InitCalcRule<RuleAlias::CHECKRULE6038>(std::move(ruleInput));
		}
		//6039
		if (function == RULES::CHECK_MIN_NUM_CREW_RANK) {
			RuleAlias::CHECKRULE6039::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6039>(std::move(ruleInput));
		}
		//6041
		if (function == RULES::CHECK_MAX_NUMBER_OF_DP_IN_RP_FOR_QQ) {
			RuleAlias::CHECKRULE6041::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6041>(std::move(ruleInput));
		}
		// 6100
		if (function == RULES::CALCULATION_OF_OFF_DUTY_PERIOD) {
			RuleAlias::CALCRULE6100::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALCULATION_OF_OFF_DUTY_PERIOD);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6100>(std::move(ruleInput));
		}
		// 6101
		if (function == RULES::REDUCE_ODP_AT_BASE_QQ) {
			RuleAlias::CALCRULE6101::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6101>(std::move(ruleInput));
		}
		// 6102
		if (function == RULES::REDUCE_ODP_AWAY_FROM_BASE_QQ) {
			RuleAlias::CALCRULE6102::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6102>(std::move(ruleInput));
		}
		// 6103
		if (function == RULES::ODP_CUMULATIVE_IN_7DAYS) {
			RuleAlias::CHECKRULE6103::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::ODP_CUMULATIVE_IN_7DAYS);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6103>(std::move(ruleInput));
		}
		// 6104
		if (function == RULES::ODP_CUMULATIVE_IN_28DAYS) {
			RuleAlias::CHECKRULE6104::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::ODP_CUMULATIVE_IN_28DAYS);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6104>(std::move(ruleInput));
		}
		// 6105
		if (function == RULES::MIN_REST_AT_BASE_OR_LAYOVER_STATION) {
			RuleAlias::CHECKRULE6105::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MIN_REST_AT_BASE_OR_LAYOVER_STATION);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6105>(std::move(ruleInput));
			RuleAlias::CALCRULE6105::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MIN_REST_AT_BASE_OR_LAYOVER_STATION);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6105>(std::move(calcRuleInput));
		}
		// 6107
		if (function == RULES::MAX_FLIGHT_TIME_QQ_CC) {
			RuleAlias::CHECKRULE6107::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MAX_FLIGHT_TIME_QQ_CC);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6107>(std::move(ruleInput));
			RuleAlias::CALCRULE6107::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MAX_FLIGHT_TIME_QQ_CC);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6107>(std::move(calcRuleInput));
		}
		// 6109
		if (function == RULES::MIN_OFF_DUTY_PERIOD_FOR_CC) {
			RuleAlias::CALCRULE6109::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MIN_OFF_DUTY_PERIOD_FOR_CC);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6109>(std::move(ruleInput));
		}
		// 6110
		if (function == RULES::MIN_ODP_IN_PERIOD_FOR_CC) {
			RuleAlias::CHECKRULE6110::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MIN_ODP_IN_PERIOD_FOR_CC);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6110>(std::move(ruleInput));
		}
		// 6111
		if (function == RULES::REST_DISCRETION_QQ) {
			RuleAlias::CHECKRULE6111::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6111>(std::move(ruleInput));

			RuleAlias::CALCRULE6111::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE6111>(std::move(calcRuleInput));
		}
		// 6115
		if (function == RULES::MAX_CONSECUTIVE_DUTY_DAYS_QQ) {
			RuleAlias::CHECKRULE6115::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MAX_CONSECUTIVE_DUTY_DAYS_QQ);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6115>(std::move(ruleInput));
		}
		//6120
		if (function == RULES::CHECK_OFF_DUTY_PERIOD_FOR_QQ) {
			RuleAlias::CHECKRULE6120::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6120>(std::move(ruleInput));
		}
		//6121
		if (function == RULES::CHECK_ASSIGNMENT_OVERLAPPABLE) {
			RuleAlias::CHECKRULE6121::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE6121>(std::move(ruleInput));
		}
		// 7000
		if (function == RULES::EASA_ACCLIMATISATION_DEFINITION) {
			RuleAlias::CALCRULE7000::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::EASA_ACCLIMATISATION_DEFINITION);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7000>(std::move(ruleInput));
		}
        // 7400
        if (function == RULES::ANR_ACCLIMATISATION_DEFINITION) {
            RuleAlias::CALCRULE7400::InputType ruleInput;
            ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::ANR_ACCLIMATISATION_DEFINITION);
            _ruleFactory->InitCalcRule<RuleAlias::CALCRULE7400>(std::move(ruleInput));
        }
        // 7405
        if (function == RULES::ANR_ULR_DUTY_DEFINITION) {
            RuleAlias::CALCRULE7405::InputType ruleInput;
            ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::ANR_ULR_DUTY_DEFINITION);
            _ruleFactory->InitCalcRule<RuleAlias::CALCRULE7405>(std::move(ruleInput));
			auto* rule = _ruleFactory->GetCalcRule<RuleAlias::CALCRULE7405>();
			if (rule) {
				rule->ParseUtcRanges();
			}
        }
		// 7460
		if (function == RULES::RESTRICT_MID_DUTY_BASE_TURN) {
			RuleAlias::CHECKRULE7460::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7460>(std::move(ruleInput));
		}
		// 7006
		if (function == RULES::CALCULATE_FLIGHT_TIME_CUSTOM_TG) {
			RuleAlias::CALCRULE7006::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALCULATE_FLIGHT_TIME_CUSTOM_TG);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7006>(std::move(ruleInput));
		}
		//7007
		if (function == RULES::CHECK_MIN_REST) {
			RuleAlias::CHECKRULE7007::InputType checkRuleInput;
			checkRuleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7007>(std::move(checkRuleInput));
		}
		////7003
		//if (function == RULES::CALCULATE_MIN_REST) {
		//	RuleAlias::CALCRULE7003::InputType caclRuleInput;
		//	caclRuleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALCULATE_MIN_REST);
		//	_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7003>(std::move(caclRuleInput));
		//}
		//7008
		if (function == RULES::CHECK_CONSECUTIVE_DUTY) {
			RuleAlias::CHECKRULE7008::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_CONSECUTIVE_DUTY);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7008>(std::move(ruleInput));
		}
		//7009
		if (function == RULES::CHECK_SINGLE_DUTY_PER_DAY) {
			RuleAlias::CHECKRULE7009::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_SINGLE_DUTY_PER_DAY);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7009>(std::move(ruleInput));
		}
		//7011
		if (function == RULES::CHECK_CREW_COUNTRY_LIMITATION) {
			RuleAlias::CHECKRULE7011::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_CREW_COUNTRY_LIMITATION);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7011>(std::move(ruleInput));
		}
		//7013
		if (function == RULES::CHECK_COF_MULTIPLE_QUALS_TG) {
			RuleAlias::CHECKRULE7013::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_COF_MULTIPLE_QUALS_TG);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7013>(std::move(ruleInput));
		}
		//7014
		if (function == RULES::CHECK_RECURRENT_EXTENDED_RECOVERY_REST_PERIOD) {
			RuleAlias::CHECKRULE7014::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_RECURRENT_EXTENDED_RECOVERY_REST_PERIOD);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7014>(std::move(ruleInput));
		}
		//7015
		if (function == RULES::CHECK_REST_FOR_LATE_ARRIVAL_OR_EARLY_START) {
			RuleAlias::CHECKRULE7015::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_REST_FOR_LATE_ARRIVAL_OR_EARLY_START);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7015>(std::move(ruleInput));
		}
		//7016
		if (function == RULES::CHECK_CREW_OPERATING_RECENCY) {
			RuleAlias::CHECKRULE7016::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_CREW_OPERATING_RECENCY);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7016>(std::move(ruleInput));
		}
		//7017
		if (function == RULES::CALC_MAX_FDP_EXT_OF_CC_TG) {
			RuleAlias::CALCRULE7017::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7017>(std::move(calcRuleInput));
		}
		//7018
		if (function == RULES::CALC_MAX_FDP_ON_STANDBY_OF_CC_TG) {
			RuleAlias::CALCRULE7018::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7018>(std::move(calcRuleInput));
		}
		//7019
		if (function == RULES::LIMIT_ACTUAL_FDP_ON_STANDBY_OF_CC_TG) {
			RuleAlias::CHECKRULE7019::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7019>(std::move(ruleInput));
		}
		//7021
		if (function == RULES::MIN_REST_BY_DP_FOR_TG) {
			RuleAlias::CALCRULE7021::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7021>(std::move(ruleInput));
		}
		//7022
		if (function == RULES::REDUCE_REST_FOR_TG) {
			RuleAlias::CALCRULE7022::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7022>(std::move(calcRuleInput));

			RuleAlias::CHECKRULE7022::InputType checkRuleInput;
			checkRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7022>(std::move(checkRuleInput));
		}
		//7023
		if (function == RULES::CALC_MIN_REST_AT_LAYOVER_FOR_TG) {
			RuleAlias::CALCRULE7023::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7023>(std::move(ruleInput));
		}
		//7024
		if (function == RULES::CHECK_MIN_REST_AT_BASE_FOR_TG) {
			RuleAlias::CALCRULE7024::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7024>(std::move(calcRuleInput));

			RuleAlias::CALCRULE7024_ACC::InputType accCalcRuleInput;
			accCalcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7024_ACC>(std::move(accCalcRuleInput), "ACC");

			RuleAlias::CHECKRULE7024::InputType checkRuleInput;
			checkRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7024>(std::move(checkRuleInput));
		}
		//7028
		if (function == RULES::CALC_SPLIT_DUTY_MAX_FDP_EXTENSION_FOR_TG) {
			RuleAlias::CALCRULE7028::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7028>(std::move(calcRuleInput));
		}
		//7029
		if (function == RULES::CALC_FDP_EXTENSION_WITH_INFLIGHT_REST_OF_CC_FOR_TG) {
			RuleAlias::CALCRULE7029::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7029>(std::move(calcRuleInput));
		}
		// 7100
		if (function == RULES::MIN_REST_FOR_EVA_FD) {
			RuleAlias::CALCRULE7100::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MIN_REST_FOR_EVA_FD);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7100>(std::move(ruleInput));
		}
		// 7115
		if (function == RULES::CHECK_MAX_CONSECUTIVE_DAY_FOR_IT) {
			RuleAlias::CHECKRULE7115::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_CONSECUTIVE_DAY_FOR_IT);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7115>(std::move(ruleInput));
		}
		//7200
		if (function == RULES::CHECK_MIN_REST_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7200::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7200>(std::move(ruleInput));

			RuleAlias::CALCRULE7200::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7200>(std::move(calcRuleInput));
		}
		//7202
		if (function == RULES::CUMULATIVE_BLH_LIMIT_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7202::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CUMULATIVE_BLH_LIMIT_FOR_EVA_FD);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7202>(std::move(ruleInput));
		}
		//7203
		if (function == RULES::CHECK_SEG_RESTRICT_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7203::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7203>(std::move(ruleInput));
		}
		//7204
		if (function == RULES::CHECK_SEG_RESTRICT_WOCL_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7204::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7204>(std::move(ruleInput));
		}
		//7205
		if (function == RULES::CHECK_MAX_BLH_IN_PERIOD_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7205::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7205>(std::move(ruleInput));
		}
		//7210
		if (function == RULES::CHECK_CONSECUTIVE_WOCL_FOR_EVA) {
			RuleAlias::CHECKRULE7210::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7210>(std::move(ruleInput));
		}
		//7211
		if (function == RULES::MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD) {
			RuleAlias::CALCRULE7211::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7211>(std::move(ruleInput));
		}
		//7212
		if (function == RULES::MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7212::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7212>(std::move(ruleInput));
		}
		//7213
		if (function == RULES::CHECK_NIGHT_REST_PERIOD_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7213::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_NIGHT_REST_PERIOD_FOR_EVA_FD);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7213>(std::move(ruleInput));
		}
		//7214
		if (function == RULES::LAYOVER_REST_LIMIT_BY_TIME_ZONE_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7214::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7214>(std::move(ruleInput));
		}

		//7215
		if (function == RULES::ROSTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD) {
			RuleAlias::CALCRULE7215::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::ROSTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7215>(std::move(ruleInput));
		}

		//7224
		if (function == RULES::ROSTER_FREIGHTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD) {
			RuleAlias::CALCRULE7224::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7224>(std::move(ruleInput));
		}

		//7217
		if (function == RULES::PAIRING_PER_DIEM_HOUR_DEFINITION_FOR_EVA_FD) {
			RuleAlias::CALCRULE7217::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::PAIRING_PER_DIEM_HOUR_DEFINITION_FOR_EVA_FD);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7217>(std::move(ruleInput));
		}

		//7218
		if (function == RULES::PER_DIEM_HOUR_DEFINITION_FOR_EVA_FD) {
			RuleAlias::CALCRULE7218::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::PER_DIEM_HOUR_DEFINITION_FOR_EVA_FD);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7218>(std::move(ruleInput));
		}

		//7219
		if (function == RULES::WORKING_HOUR_DEFINITION_FOR_EVA_FD) {
			RuleAlias::CALCRULE7219::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::WORKING_HOUR_DEFINITION_FOR_EVA_FD);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7219>(std::move(ruleInput));
		}

		//7220
		if (function == RULES::NUM_OF_CREW_ON_FLIGHT_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7220::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7220>(std::move(ruleInput));
		}

		//7221 DISALLOW_IMPLAUSIBLE_CONNECTIONS
		if (function == RULES::DISALLOW_IMPLAUSIBLE_CONNECTIONS) {
			RuleAlias::CHECKRULE7221::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::DISALLOW_IMPLAUSIBLE_CONNECTIONS);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7221>(std::move(ruleInput));
		}

		//7222 MAX_LAYOVERS_IN_TRIP
		if (function == RULES::MAX_LAYOVERS_IN_TRIP) {
			RuleAlias::CHECKRULE7222::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MAX_LAYOVERS_IN_TRIP);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7222>(std::move(ruleInput));
		}

		//7223 MAX_LAYOVER_IN_MONTH
		if (function == RULES::MAX_LAYOVER_IN_MONTH) {
			RuleAlias::CHECKRULE7223::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::MAX_LAYOVER_IN_MONTH);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7223>(std::move(ruleInput));
		}


		//7225
		if (function == RULES::CHECK_TRAINING_ROSTER_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7225::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7225>(std::move(ruleInput));
		}

		//7226
		if (function == RULES::CHECK_TRAINING_END_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7226::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7226>(std::move(ruleInput));
		}

		//7227
		if (function == RULES::CHECK_LAYOVER_RESTRICTION) {
			RuleAlias::CHECKRULE7227::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7227>(std::move(ruleInput));
		}

		//7228
		if (function == RULES::TRAINING_BRIEF_AND_DEBRIEF) {
			RuleAlias::CHECKRULE7228::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7228>(std::move(ruleInput));

			RuleAlias::CALCRULE7228::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7228>(std::move(calcRuleInput));
		}

		//7229
		if (function == RULES::CHECK_PASSPORT_AND_VISA_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7229::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CHECK_PASSPORT_AND_VISA_FOR_EVA_FD);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7229>(std::move(ruleInput));
		}

		//7230
		if (function == RULES::LIMIT_PROGRAM_COURSE_ROLE) {
			RuleAlias::CHECKRULE7230::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7230>(std::move(ruleInput));
		}

		//7231
		if (function == RULES::CHECK_RENEW_CERT_IN_ADVANCE) {
			RuleAlias::CHECKRULE7231::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7231>(std::move(ruleInput));
		}

		//7232
		if (function == RULES::CHECK_MAX_CONSECUTIVE_ROSTER_FOR_IT) {
			RuleAlias::CHECKRULE7232::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7232>(std::move(ruleInput));
		}

		//7233
		if (function == RULES::LIMIT_COURSE_TIME_PERIOD_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7233::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7233>(std::move(ruleInput));
		}

		//7234
		if (function == RULES::LIMIT_COURSE_ROLE_QUAL_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7234::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7234>(std::move(ruleInput));
		}

		//7235
		if (function == RULES::LIMIT_COURSE_ROLE_NUMBERS_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7235::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7235>(std::move(ruleInput));
		}

		//7236
		if (function == RULES::LIMIT_DAYS_BETWEEN_COURSES_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7236::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7236>(std::move(ruleInput));
		}

		//7237
		if (function == RULES::LIMIT_DEPEND_BETWEEN_COURSES_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7237::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7237>(std::move(ruleInput));
		}

		//7238
		if (function == RULES::LIMIT_COURSE_START_TIME_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7238::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7238>(std::move(ruleInput));
		}

		//7239
		if (function == RULES::LIMIT_COURSE_DEVICE_TYPE_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7239::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7239>(std::move(ruleInput));
		}

		//7240
		if (function == RULES::CHECK_COURSE_DEVICE_AVAIL_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7240::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7240>(std::move(ruleInput));
		}

		//7241
		if (function == RULES::LIMIT_COURSE_PIP_NUMBERS_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7241::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7241>(std::move(ruleInput));
		}

		//7242
		if (function == RULES::LIMIT_COURSE_DURATION_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7242::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7242>(std::move(ruleInput));
		}

		//7243
		if (function == RULES::LIMIT_SAME_ROLE_INSTRUCTOR_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7243::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7243>(std::move(ruleInput));
		}

		//7244
		if (function == RULES::LIMIT_PROGRAM_COURSE_ON_FLIGHT_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7244::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7244>(std::move(ruleInput));
		}

		//7245
		if (function == RULES::LIMIT_TRAINING_ROLE_IN_TEAM_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7245::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7245>(std::move(ruleInput));
		}

		//7246
		if (function == RULES::LIMIT_SAME_DEVICE_IN_PROGRAM_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7246::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7246>(std::move(ruleInput));
		}

		//7247
		if (function == RULES::RESTRICT_INSTRUCTOR_HOLD_ROLE_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7247::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7247>(std::move(ruleInput));
		}

		//7248
		if (function == RULES::RESTRICT_TRAINEE_HOLD_ROLE_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7248::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7248>(std::move(ruleInput));
		}

		//7249
		if (function == RULES::REQUIRED_MIN_NUM_OF_COURSE_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7249::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7249>(std::move(ruleInput));
		}

		//7250
		if (function == RULES::CHECK_UNASSIGNED_COURSE_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7250::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7250>(std::move(ruleInput));
		}

		//7251
		if (function == RULES::LIMIT_COURSE_ROLE_QUAL_NUMBERS_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7251::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7251>(std::move(ruleInput));
		}

		//7252
		if (function == RULES::CHECK_FAILED_COURSE_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7252::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7252>(std::move(ruleInput));
		}

		//7253
		if (function == RULES::LIMIT_LEG_AND_STATION_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7253::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7253>(std::move(ruleInput));
		}

		//7254
		if (function == RULES::BUDDIES_IN_SAME_COURSE_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7254::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7254>(std::move(ruleInput));
		}

		//7255
		if (function == RULES::ONLY_SAME_COURSE_CODE_IN_DUTY_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7255::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7255>(std::move(ruleInput));
		}

		//7256
		if (function == RULES::LIMIT_MAX_GAP_DAYS_BETWEEN_COURSES_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7256::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7256>(std::move(ruleInput));
		}

		//7257
		if (function == RULES::LIMIT_NUMBER_OF_TRAINEES_FOR_COURSES_ON_SAME_DAY_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7257::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7257>(std::move(ruleInput));
		}

		//7258
		if (function == RULES::LIMIT_SAME_ROLE_INSTRUCTOR_ON_EXTRA_COURSE_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7258::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7258>(std::move(ruleInput));
		}

		//7259
		if (function == RULES::CHECK_COURSE_ONLY_ASSIGNED_TO_INSTRUCTOR) {
			RuleAlias::CHECKRULE7259::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7259>(std::move(ruleInput));
		}

		//7260
		if (function == RULES::CALCULATE_PIF_FOR_EVA_FD) {
			RuleAlias::CALCRULE7260::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7260>(std::move(ruleInput));
		}

		//7261
		if (function == RULES::CHECK_ACCLIMATIZED_REST_FOR_EVA) {
			RuleAlias::CHECKRULE7261::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7261>(std::move(ruleInput));
		}

		//7262
		if (function == RULES::LIMIT_INEXP_CREW_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7262::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7262>(std::move(ruleInput));
		}

		//7263
		if (function == RULES::CHECK_MAX_EARLY_START_OR_LATE_FINISH) {
			RuleAlias::CHECKRULE7263::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7263>(std::move(ruleInput));
		}

		//7264
		if (function == RULES::CHECK_SCH_TIME_ABNL_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7264::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7264>(std::move(ruleInput));
		}

		//7265
		if (function == RULES::CHECK_SCH_MIN_REST_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7265::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7265>(std::move(ruleInput));
		}

		//7266
		if (function == RULES::CHECK_SCH_MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7266::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7266>(std::move(ruleInput));
		}

		//7267
		if (function == RULES::SCH_MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD) {
			RuleAlias::CHECKRULE7267::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7267>(std::move(ruleInput));
		}

		//7268
		if (function == RULES::CHECK_SCH_CONSECUTIVE_WOCL_FOR_EVA) {
			RuleAlias::CHECKRULE7268::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7268>(std::move(ruleInput));
		}

		//7271
		if (function == RULES::CHECK_SCH_ACCLIMATIZED_REST_FOR_EVA) {
			RuleAlias::CHECKRULE7271::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7271>(std::move(ruleInput));
		}

		//7272
		if (function == RULES::CALCULATE_STANDBY_DP_TG) {
			RuleAlias::CALCRULE7272::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7272>(std::move(ruleInput));
		}

		//7273
		if (function == RULES::CHECK_MIN_CONNECT_IN_DUTY) {
			RuleAlias::CHECKRULE7273::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7273>(std::move(ruleInput));
		}

		//7274
		if (function == RULES::CHECK_IOE_PAHSE_FLIGHT_COMPOSITION) {
			RuleAlias::CHECKRULE7274::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7274>(std::move(ruleInput));
		}

		//7275
		if (function == RULES::CHECk_DAYS_OFF_FOR_TRADE) {
			RuleAlias::CHECKRULE7275::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7275>(std::move(ruleInput));
		}
		//7276
		if (function == RULES::CHECK_DISRUPTIVE_SCHEDULES_LOCAL_NIGHT_FOR_TG) {
			RuleAlias::CHECKRULE7276::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7276>(std::move(ruleInput));
		}
		
		//7277
		if (function == RULES::CHECK_DISRUPTIVE_SCHEDULES_RERRP_FOR_TG) {
			RuleAlias::CHECKRULE7277::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7277>(std::move(ruleInput));
		}
		
		//7278
		if (function == RULES::CALCULATE_COURSE_FDP_FOR_TG) {
			RuleAlias::CALCRULE7278::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7278>(std::move(ruleInput));
		}

		//7279
		if (function == RULES::CHECK_ULR_ON_TRAINING_FOR_EVAFD) {
			RuleAlias::CHECKRULE7279::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7279>(std::move(ruleInput));
		}
		
		//7300
		if (function == RULES::CALC_MAX_DUTY_TIME_FOR_PR) {
			RuleAlias::CALCRULE7300::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7300>(std::move(ruleInput));
		}

		//7302
		if (function == RULES::CALC_MAX_FDP_BY_CALLOUT_STANDBY_FOR_PR) {
			RuleAlias::CALCRULE7302::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7302>(std::move(calcRuleInput));
		}

		//7303
		if (function == RULES::CALC_MAX_DP_PER_AVG_BLH_OF_CBA_FOR_PR) {
			RuleAlias::CALCRULE7303::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7303>(std::move(ruleInput));
		}

		//7305
		if (function == RULES::LIMIT_MAX_CONSECUTIVE_DUTY_TIMES_FOR_PR) {
			RuleAlias::CHECKRULE7305::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7305>(std::move(ruleInput));
		}

		//7306
		if (function == RULES::LIMIT_MIN_REST_LFES_FLIGHT_FOR_PR) {
			RuleAlias::CHECKRULE7306::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7306>(std::move(ruleInput));
		}

		// 7307
		if (function == RULES::MIN_REST_BASED_LOCAL_NIGHT_FOR_PR) {
			RuleAlias::CHECKRULE7307::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7307>(std::move(ruleInput));

			RuleAlias::CALCRULE7307::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7307>(std::move(calcRuleInput));
		}

		//7308
		if (function == RULES::CHECK_EARNED_DAYS_OFF_FOR_PR) {
			RuleAlias::CHECKRULE7308::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7308>(std::move(ruleInput));
		}

		//7309
		if (function == RULES::LIMIT_MIN_REST_BETWEEN_ROSTERS_FOR_PR) {
			RuleAlias::CHECKRULE7309::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7309>(std::move(ruleInput));
		}

		//7310
		if (function == RULES::CALC_DUTY_ALOFT_FOR_PR) {
			RuleAlias::CALCRULE7310::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7310>(std::move(ruleInput));
		}

		//7311
		if (function == RULES::CALC_MIN_REST_BY_BLH_PR) {
			RuleAlias::CHECKRULE7311::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7311>(std::move(ruleInput));

			RuleAlias::CALCRULE7311::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7311>(std::move(calcRuleInput));
		}

		//7313
		if (function == RULES::CALC_MAX_DP_BY_COMPLEMENT_FOR_PR) {
			RuleAlias::CALCRULE7313::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7313>(std::move(ruleInput));
		}

		//7312
		if (function == RULES::CHECK_MAX_FLIGHTS_IN_PEROID_PR) {
			RuleAlias::CHECKRULE7312::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7312>(std::move(ruleInput));
		}

		//7314
		if (function == RULES::CHECK_GENDER_ON_FLIGHT_BY_COMPOSITION_FOR_PR) {
			RuleAlias::CHECKRULE7314::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7314>(std::move(ruleInput));
		}

		//7315
		if (function == RULES::RESTICT_CREW_OR_FLIGHT_FOR_PR) {
			RuleAlias::CHECKRULE7315::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7315>(std::move(ruleInput));
		}

		//7320
		if (function == RULES::CREW_ONLY_PERFORM_SPEC_TASK_FOR_PR) {
			RuleAlias::CHECKRULE7320::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7320>(std::move(ruleInput));
		}

		//7321
		if (function == RULES::TASK_ONLY_OPERATED_FILTERED_CREW_FOR_PR) {
			RuleAlias::CHECKRULE7321::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7321>(std::move(ruleInput));
		}

		//7322
		if (function == RULES::CREW_CANNOT_OPERATE_SPEC_TASK_FOR_PR) {
			RuleAlias::CHECKRULE7322::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7322>(std::move(ruleInput));
		}

		//7323
		if (function == RULES::CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_PR) {
			RuleAlias::CHECKRULE7323::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7323>(std::move(ruleInput));
		}

		//7324
		if (function == RULES::CHECK_BIRTHDAY_DAYS_OFF_FOR_PR) {
			RuleAlias::CHECKRULE7324::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7324>(std::move(ruleInput));
		}

		//7326
		if (function == RULES::CHECK_EARLIES_BRIEF_OR_LATEST_DEBRIEF_AFTER_ROSTER_FOR_PR) {
			RuleAlias::CHECKRULE7326::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7326>(std::move(ruleInput));
		}

		//7327
		if (function == RULES::CHECK_MIN_REST_AFTER_BASE_CHANGE_FOR_PR) {
			RuleAlias::CHECKRULE7327::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7327>(std::move(ruleInput));
		}

		//7328
		if (function == RULES::CALC_CREDIT_HOURS_FOR_PR) {
			RuleAlias::CALCRULE7328::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALC_CREDIT_HOURS_FOR_PR);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7328>(std::move(ruleInput));
		}
        //7412
        if(function==RULES::CHECK_MINIMUM_REST_PERIOD_FOR_SQ)
        {
            RuleAlias::CHECKRULE7412::InputType ruleInput;
            ruleInput.dbRules =this->_dbData->getRuleFunctions(function);
            _ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7412>(std::move(ruleInput));
            RuleAlias::CALCRULE7412::InputType calcRuleInput;
            calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
            _ruleFactory->InitCalcRule<RuleAlias::CALCRULE7412>(std::move(calcRuleInput));
        }

		//7325
		if (function == RULES::CHECK_DAYS_OFF_PATTERNS_FOR_PR) {
			RuleAlias::CHECKRULE7325::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7325>(std::move(ruleInput));
		}

		//7356
		if (function == RULES::LIMIT_ATTR_SPACING_BASED_MANDAY_FOR_PR) {
			RuleAlias::CHECKRULE7356::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7356>(std::move(ruleInput));
		}

		//7357
		if (function == RULES::LIMIT_MAX_ATTR_NUM_BASED_MANDAY_FOR_PR) {
			RuleAlias::CHECKRULE7357::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7357>(std::move(ruleInput));
		}

		//7358
		if (function == RULES::CHECK_MAX_FATIGUE_SCORE_FOR_5J) {
			RuleAlias::CHECKRULE7358::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7358>(std::move(ruleInput));
		}

		//7359
		if (function == RULES::CHECL_STANDARD_FDP_EXTENSION_REST_REQUIREMENT_FOR_5J) {
			RuleAlias::CHECKRULE7359::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7359>(std::move(ruleInput));
		}

		//7360
		if (function == RULES::CHECK_AIRCRAFT_CHANGE_ALERT_FOR_PR) {
			RuleAlias::CHECKRULE7360::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7360>(std::move(ruleInput));
		}

		//7361
		if (function == RULES::CHECK_MIN_DAYS_OFF_FOR_5J) {
			RuleAlias::CHECKRULE7361::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7361>(std::move(ruleInput));
		}

		//7362
		if (function == RULES::LIMIT_AREA_ENTRY_COUNT_FOR_PR) {
			RuleAlias::CHECKRULE7362::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7362>(std::move(ruleInput));
		}

		//7363
		if (function == RULES::CALCULATE_INEXPERIENCED_CREW_FOR_5J) {
			RuleAlias::CALCRULE7363::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7363>(std::move(ruleInput));
		}

		//7364
		if (function == RULES::CHECK_INEXPERIENCED_CREW_FOR_5J) {
			RuleAlias::CHECKRULE7364::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7364>(std::move(ruleInput));
		}

		//7365
		if (function == RULES::CHECK_LEGAL_DAYS_OFF_FOR_5J) {
			RuleAlias::CHECKRULE7365::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7365>(std::move(ruleInput));
		}

		//7366
		if (function == RULES::CHECK_CONSECUTIVE_DAYS_OFF_REQUIREMENT_FOR_5J) {
			RuleAlias::CHECKRULE7366::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7366>(std::move(ruleInput));
		}

		//7317
		if (function == RULES::CALCULATE_MAX_FDP_AND_EXTENSION_FOR_5J) {
			RuleAlias::CALCRULE7317::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7317>(std::move(ruleInput));
		}

		//7372
		if (function == RULES::CALCULATE_GROUND_DP_TG) {
			RuleAlias::CALCRULE7372::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7372>(std::move(ruleInput));
		}

		//7373
		if (function == RULES::CALC_GROUND_ROSTER_MIN_REST_FOR_5J) {
			RuleAlias::CALCRULE7373::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7373>(std::move(ruleInput));
		}

		//7374
		if (function == RULES::CALC_MAX_FDP_BY_HSB_CALLOUT_FOR_5J) {
			RuleAlias::CALCRULE7374::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7374>(std::move(ruleInput));
		}

		//7387
		if (function == RULES::CHECK_STANDBY_CALLOUT_DURATION_FOR_5J) {
			RuleAlias::CHECKRULE7387::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7387>(std::move(ruleInput));
		}

		//7388
		if (function == RULES::LIMIT_COURSE_WEEKDAY_FOR_5J) {
			RuleAlias::CHECKRULE7388::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7388>(std::move(ruleInput));
		}

		//7389
		if (function == RULES::LIMIT_TRAINING_CONSECUTIVE_DAYS_FOR_5J) {
			RuleAlias::CHECKRULE7389::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7389>(std::move(ruleInput));
		}

		//7461
		if (function == RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ) {
			RuleAlias::CHECKRULE7461::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7461>(std::move(ruleInput));
		}

		//7462
		if (function == RULES::CHECK_ALLOWED_MULTI_SECTOR_DUTY_FOR_FREIGHTER_FOR_SQ) {
			RuleAlias::CHECKRULE7462::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7462>(std::move(ruleInput));
		}

		// 7463
		if (function == RULES::LIMIT_SWINGBACK_FOR_SQ) {
			RuleAlias::CHECKRULE7463::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7463>(std::move(ruleInput));
		}

		// 7464
		if (function == RULES::LIMIT_TRANSPORT_LENGTH_FOR_SQ) {
			RuleAlias::CHECKRULE7464::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7464>(std::move(ruleInput));
		}

		// 7465
		if (function == RULES::CALC_MIN_SCHEDULE_DAYS_OFF_AT_BASE_FOR_SQ) {
			RuleAlias::CALCRULE7465::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7465>(std::move(calcRuleInput));
		}

		// 7466
		if (function == RULES::CALC_EXTRA_DAYS_OFF_AT_BASE_FOR_SQ) {
			RuleAlias::CALCRULE7466::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7466>(std::move(calcRuleInput));
		}

		// 7467
		if (function == RULES::LIMIT_REST_TIME_BETWEEN_FLIGHTS_FOR_SQ) {
			RuleAlias::CHECKRULE7467::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7467>(std::move(ruleInput));
		}

		// 7468
		if (function == RULES::LIMIT_POSITIONING_IN_COP_FOR_SQ) {
			RuleAlias::CHECKRULE7468::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7468>(std::move(ruleInput));
		}
		// 7469
		if (function == RULES::FORCED_COMPLEMENT_BY_DUTY_ROUTE_FOR_SQ) {
			RuleAlias::CHECKRULE7469::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7469>(std::move(ruleInput));
		}

		// 7480
		if (function == RULES::LIMIT_DUTY_DAYS_OFF_FOR_HX) {
			RuleAlias::CHECKRULE7480::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);

			auto dayOffDefinition = this->_dbData->getRuleFunctions(RULES::ANR_DAY_OFF_DEFINITION);
			if (!dayOffDefinition.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ANR_DAY_OFF_DEFINITION, dayOffDefinition);
			}
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7480>(std::move(ruleInput));
		}

		// 7481
		if (function == RULES::RED_EYE_DEFINITION_FOR_HX) {
			RuleAlias::CALCRULE7481::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::RED_EYE_DEFINITION_FOR_HX);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7481>(std::move(ruleInput));
		}

		// 7484
		if (function == RULES::CALCULATE_MAX_FDP_FOR_HX) {
			RuleAlias::CALCRULE7484::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALCULATE_MAX_FDP_FOR_HX);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7484>(std::move(ruleInput));
		}

		// 7482
		if (function == RULES::ACCLIMATISATION_DEFINITION_FOR_HX) {
            //检查法规
			RuleAlias::CHECKRULE7482::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);

			auto dayOffDefinition2 = this->_dbData->getRuleFunctions(RULES::ANR_DAY_OFF_DEFINITION);
			if (!dayOffDefinition2.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ANR_DAY_OFF_DEFINITION, dayOffDefinition2);
			}

			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7482>(std::move(ruleInput));

			//计算法规
			RuleAlias::CALCRULE7482::InputType calcRuleInput;
			calcRuleInput.dbRules = this->_dbData->getRuleFunctions(function);

			auto dayOffDefinition = this->_dbData->getRuleFunctions(RULES::ANR_DAY_OFF_DEFINITION);
			if (!dayOffDefinition.empty()) {
				calcRuleInput.dependDbRules.emplace(RULES::ANR_DAY_OFF_DEFINITION, dayOffDefinition);
			}

			auto redEyeDutyDefinition = this->_dbData->getRuleFunctions(RULES::RED_EYE_DEFINITION_FOR_HX);
			if (!redEyeDutyDefinition.empty()) {
				calcRuleInput.dependDbRules.emplace(RULES::RED_EYE_DEFINITION_FOR_HX, redEyeDutyDefinition);
			}

			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7482>(std::move(calcRuleInput));
		}

		// 7485
		if (function == RULES::CHECK_COMPOSITION_REQUIREMENT_FOR_HX) {
			RuleAlias::CHECKRULE7485::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7485>(std::move(ruleInput));
		}

		// 7486
		if (function == RULES::LIMIT_RED_EYE_DUTY_FOR_HX) {
			RuleAlias::CHECKRULE7486::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);

			auto redEyeDutyDefinition = this->_dbData->getRuleFunctions(RULES::RED_EYE_DEFINITION_FOR_HX);
			if (!redEyeDutyDefinition.empty()) {
				ruleInput.dependDbRules.emplace(RULES::RED_EYE_DEFINITION_FOR_HX, redEyeDutyDefinition);
			}

			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7486>(std::move(ruleInput));
		}

		// 7487
		if (function == RULES::CHECK_MAX_DURATION_FROM_STANDBY_TO_FLIGHT_DUTY_END_FOR_HX) {
			RuleAlias::CHECKRULE7487::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7487>(std::move(ruleInput));
		}

		// 7488
		if (function == RULES::CALCULATE_MIN_REST_FOR_HX) {
			RuleAlias::CALCRULE7488::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALCULATE_MIN_REST_FOR_HX);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7488>(std::move(ruleInput));
		}

		// 7489
		if (function == RULES::LIMIT_CONSECUTIVE_DAY_MIN_REST_FOR_HX) {
			RuleAlias::CHECKRULE7489::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7489>(std::move(ruleInput));
		}

		// 7490
		if (function == RULES::CALCULATE_MAX_FDP_EXTENSION_FOR_HX) {
			RuleAlias::CALCRULE7490::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALCULATE_MAX_FDP_EXTENSION_FOR_HX);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7490>(std::move(ruleInput));
		}

		// 7490
		if (function == RULES::CALCULATE_MAX_FDP_EXTENSION_FOR_CC_FOR_HX) {
			RuleAlias::CALCRULE7491::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALCULATE_MAX_FDP_EXTENSION_FOR_CC_FOR_HX);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7491>(std::move(ruleInput));
		}

		// 7492
		if (function == RULES::CALCULATE_MAX_FDP_FOR_SPLIT_DUTY_FOR_HX) {
			RuleAlias::CALCRULE7492::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALCULATE_MAX_FDP_FOR_SPLIT_DUTY_FOR_HX);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7492>(std::move(ruleInput));
		}

		// 7493
		if (function == RULES::LIMIT_CONSECUTIVE_DUTY_DAYS_OFF_FOR_HX) {
			RuleAlias::CHECKRULE7493::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);

			auto dayOffDefinition = this->_dbData->getRuleFunctions(RULES::ANR_DAY_OFF_DEFINITION);
			if (!dayOffDefinition.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ANR_DAY_OFF_DEFINITION, dayOffDefinition);
			}
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7493>(std::move(ruleInput));
		}

		// 7494
		if (function == RULES::LIMIT_FLEET_ASSIGNMENT_BY_QUALIFICATION_FOR_HX) {
			RuleAlias::CHECKRULE7494::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7494>(std::move(ruleInput));
		}
		
		// 7495
		if (function == RULES::LIMIT_CONSECUTIVE_TASK_BEFORE_AFTER_DAYSOFF_FOR_HX) {
			RuleAlias::CHECKRULE7495::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);

			auto dayOffDefinition = this->_dbData->getRuleFunctions(RULES::ANR_DAY_OFF_DEFINITION);
			if (!dayOffDefinition.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ANR_DAY_OFF_DEFINITION, dayOffDefinition);
			}
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7495>(std::move(ruleInput));
		}

		// 7496
		if (function == RULES::LIMIT_MIN_WORK_DAYS_BETWEEN_ASSIGNMENTS_FOR_HX) {
			RuleAlias::CHECKRULE7496::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7496>(std::move(ruleInput));
		}

		// 7500
		if (function == RULES::ACCLIMATISATION_DEFINITION_FOR_CARS) {
			RuleAlias::CALCRULE7500::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::ACCLIMATISATION_DEFINITION_FOR_CARS);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7500>(std::move(ruleInput));
		}

		//7501
		if (function == RULES::LIMIT_SINGLE_DAY_FREE_FROM_DUTY_FOR_CARS) {
			RuleAlias::CHECKRULE7501::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);

			auto accStateDefinition = this->_dbData->getRuleFunctions(RULES::ACCLIMATISATION_DEFINITION_FOR_CARS);
			if (!accStateDefinition.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ACCLIMATISATION_DEFINITION_FOR_CARS, accStateDefinition);
			}

			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7501>(std::move(ruleInput));
		}

		//7502
		if (function == RULES::CALC_CREDIT_HOURS_FOR_CARS) {
			RuleAlias::CALCRULE7502::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(RULES::CALC_CREDIT_HOURS_FOR_CARS);
			_ruleFactory->InitCalcRule<RuleAlias::CALCRULE7502>(std::move(ruleInput));
		}
		
		//7503 LIMIT_CONSECUTIVE_WOCL
		if (function == RULES::LIMIT_CONSECUTIVE_WOCL) {
			RuleAlias::CHECKRULE7503::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);

			auto accStateDefinition = this->_dbData->getRuleFunctions(RULES::ACCLIMATISATION_DEFINITION_FOR_CARS);
			if (!accStateDefinition.empty()) {
				ruleInput.dependDbRules.emplace(RULES::ACCLIMATISATION_DEFINITION_FOR_CARS, accStateDefinition);
			}

			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7503>(std::move(ruleInput));
		}

		//7504 CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_F8
		if (function == RULES::CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_F8) {
			RuleAlias::CHECKRULE7504::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7504>(std::move(ruleInput));
		}

		//7505 MINIMUM_DAYS_OFF_FOR_CARS
		if (function == RULES::MINIMUM_DAYS_OFF_FOR_CARS) {
			RuleAlias::CHECKRULE7505::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7505>(std::move(ruleInput));
		}

		//7506 SINGLE_DAILY_CHECKIN_FOR_CARS
		if (function == RULES::SINGLE_DAILY_CHECKIN_FOR_CARS) {
			RuleAlias::CHECKRULE7506::InputType ruleInput;
			ruleInput.dbRules = this->_dbData->getRuleFunctions(function);
			_ruleFactory->InitCheckRule<RuleAlias::CHECKRULE7506>(std::move(ruleInput));
		}
	}

	Logger::getRuleLogger()->debug("initRule load function size: {}, list: {}", functions.size(), StringUtils::Join(functions, ","));
}
		

void LegalityChecker::releaseDB()
{
	//cleanupDBConnection(&_dbCtx);
}

vector<RULE_COMPOSITION> LegalityChecker::getLegalCompositions(Duty* duty)
{
	CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
	//duty->calculateFDP(0, FDP.str, FDP.end);

	//根据block得到的经济配比
	vector<RULE_COMPOSITION> comp1, comp2;

	if (this->_dbData->getRuleFunctions(RULES::MAX_BLOCK_PERDUTY).size() > 0)
		comp1 = calCompByBlock(duty);
	else
		comp1 = calCompByBlock_R4(duty);

	//根据fdp得到的经济配比
	if (this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY).size() > 0)
		comp2 = calCompByFDP(duty);
	else
		comp2 = calCompByFDP_R4(duty);

	vector<RULE_COMPOSITION> intersComp;

	set_intersection(comp1.begin(), comp1.end(), comp2.begin(), comp2.end(), std::back_inserter(intersComp));

	return intersComp;
}

//根据2007/2008,3007/3008得到DUTY最经济配比, 用于MIN REST法规
string LegalityChecker::getMinCompositionForRest(Duty * duty)
{
	string minComposition = RuleParams::GetInstancePtr()->basicComposition;

	vector<RULE_COMPOSITION> legalCompositions = getLegalCompositions(duty);

	int minPrio = 0;
	for (vector<RULE_COMPOSITION>::iterator itr = legalCompositions.begin(); itr != legalCompositions.end(); itr++)
	{
		if ((*itr).priority < minPrio || itr == legalCompositions.begin())
		{
			minPrio = itr->priority;
			minComposition = itr->name;
		}
	}

	return minComposition;
}

bool LegalityChecker::basicSetting(Duty* duty, bool onlyPlaceDutyNode, const Duty* beforeDuty, const Duty* nextDuty) {
	return basicSetting(duty, "", onlyPlaceDutyNode, beforeDuty, nextDuty);
}

bool LegalityChecker::basicSetting(Duty * duty, const string& pairingBase, bool onlyPlaceDutyNode, const Duty* beforeDuty, const Duty* nextDuty)
{
    if (!onlyPlaceDutyNode) {
        long long pairingId = duty->getPairingId();
        if (_dbData->pairingIdMap.find(pairingId) != _dbData->pairingIdMap.end()) {
            Pairing * p = _dbData->pairingIdMap[pairingId];
            if (p != NULL){
                if (p->getPrimeActivity() == "PSG") {
                    return true;
                }
				setRedEyeDutyForHX(p);//7481
                if (p->getDivision() == "P"){
					setAcclimationStateOfEASA(p);//7000
					// 7400 ANR acclimatisation
					setAcclimationStateOfANR(p);//7400
					setAcclimationState_QQ(p);//6005
					setAcclimationStateForHX(p);//7482
                    /*setDutyDiscretion_R5(duty);
                    setDutyDiscretion_R4(duty);*/
                }
                else{
                    setDutyDiscretion_2030(duty);
                }
            }
        }
    }

    //mantis#5082 在每次进行Brief/deBrief/pickUp/dropOff赋值前 先计算DomIntype
    duty->setDomIntType(Utility::GetInstancePtr()->getDutySegType(duty, &(this->_dbData->airportList)));

    setDutyBuilderReq(duty);
    setDutyBrief(duty, pairingBase);
    setDutyDebrief(duty, pairingBase);
    setDutyPickup(duty, pairingBase, beforeDuty, nextDuty);
    setDutyDropoff(duty, pairingBase, beforeDuty, nextDuty);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		refreshPairingNodeOfDutyThreadLocalTime(duty, _dbData.get());
	}

    if (!onlyPlaceDutyNode) {
		// 7481 RED_EYE_DEFINITION_FOR_HX
		setRedEyeDutyForHX(duty);

		//7000 EASA set Acc State
		setAcclimationStateOfEASA(duty);

        //7400 ANR set Acc State
        setAcclimationStateOfANR(duty);

        //6005 QQ set Acc State
        setAcclimationState_QQ(duty);

		// 7482 ACCLIMATISATION_DEFINITION_FOR_HX
		setAcclimationStateForHX(duty);

		// 7500 ACCLIMATISATION_DEFINITION_FOR_CARS
		setAcclimationStateForCARS(duty);

        //6007 QQ设置Max FDP
        calculateMaxFlightDutyPeriod_QQ(duty);
        //7410 ANR 设置Max FDP
        calculateMaxFlightDutyPeriod_ANR(duty);
        //7484 HX 设置Max FDP
        calculateMaxFlightDutyPeriod_HX(duty);

		//3007 MAX_FDP_PERDUTY 设置Max FDP
		setFDPPerDutyByDuty(duty);

		//7300 CALC_MAX_DUTY_TIME_FOR_PR
		setMaxDP_PR(duty);

		//7303 CALC_MAX_DP_PER_AVG_BLH_OF_CBA_FOR_PR
		setMaxDPPerAvgBLHOfCBA_PR(duty);

        //6006 QQ设置机场休息设施
        setAirportRestFacilty_QQ(duty);

        //6107 QQ计算maxFDP for CC 根据配置，不配置则不计算
        calculateMaxFlighTime_QQ_CC(duty);

		//6020 QQ计算MaxFDP by Split Duty
        setMaxFlightDutyBySplitDuty_QQ(duty);

		//6025 LIMIT_MAX_DP_QQ
		calculateMaxDP_QQ(duty);

		//7028 TG 计算FDP Extension
		calculateSplitDutyMaxFDPExtension_TG(duty);

		//7017 TG CC 计算FTP扩展
		calculateMaxFDPExtension_TG_CC(duty);

		//7407 5J 计算Max FDP和Extension
		calculateDutyFdpAndExtensionFor5J(duty);

		calculateMaxFlightDutyPeriod_HX(duty);

		apply3021MaxFdpBriefDelta(duty, pairingBase);
    }
	return true;
}
bool LegalityChecker::basicSettingFirstSeg(Duty * duty, const string& pairingBase, const Duty* beforeDuty, const Duty* nextDuty){

	long long pairingId = duty->getPairingId();
	if (_dbData->pairingIdMap.find(pairingId) != _dbData->pairingIdMap.end()) {
		Pairing * p = _dbData->pairingIdMap[pairingId];
		if (p != NULL){
			if (p->getPrimeActivity() == "PSG") {
				return true;
			}	
			//op#2128 setDirection
			if (p->getDivision() == "P"){
				calculateMaxFlightDutyPeriod_QQ(duty);
				//7410 ANR
				calculateMaxFlightDutyPeriod_ANR(duty);
				//7484 HX
				calculateMaxFlightDutyPeriod_HX(duty);
				/*setDutyDiscretion_R5(duty);
				setDutyDiscretion_R4(duty);*/
			}
			else{
				setDutyDiscretion_2030(duty);
			}
			//6006 QQ设置机场休息设施
			setAirportRestFacilty_QQ(duty);

			//3007 MAX_FDP_PERDUTY 设置Max FDP
			setFDPPerDutyByDuty(duty);

			// 6107 QQ计算maxFDP for CC 根据配置，不配置则不计算
			calculateMaxFlighTime_QQ_CC(duty);

			//6020 QQ计算MaxFDP by Split Duty
			setMaxFlightDutyBySplitDuty_QQ(duty);

			//6025 LIMIT_MAX_DP_QQ
			calculateMaxDP_QQ(duty);

			//7028 TG 计算FDP Extension
			calculateSplitDutyMaxFDPExtension_TG(duty);

			//7017 TG CC 计算FTP扩展
			calculateMaxFDPExtension_TG_CC(duty);

			//7407 5J 计算Max FDP和Extension
			calculateDutyFdpAndExtensionFor5J(duty);

			calculateMaxFlightDutyPeriod_HX(duty);

			apply3021MaxFdpBriefDelta(duty, pairingBase);
		}
	}
	//3010
	setDutyBuilderReq(duty);
	duty->calculateDutyValues(this->_application);
	//mantis#5082 在每次进行Brief/deBrief/pickUp/dropOff赋值前 先计算DomIntype
	duty->setDomIntType(Utility::GetInstancePtr()->getDutySegType(duty, &(this->_dbData->airportList)));
	setDutyBrief(duty, pairingBase);
	setDutyPickup(duty, pairingBase, beforeDuty, nextDuty);
	return true;
}
bool LegalityChecker::basicSettingEndSeg(Duty * duty, const string& pairingBase, const Duty* beforeDuty, const Duty* nextDuty){
	long long pairingId = duty->getPairingId();
	if (_dbData->pairingIdMap.find(pairingId) != _dbData->pairingIdMap.end()) {
		Pairing * p = _dbData->pairingIdMap[pairingId];
		if (p != NULL){
			if (p->getPrimeActivity() == "PSG") {
				return true;
			}
			//op#2128 setDirection
			if (p->getDivision() == "P"){
				calculateMaxFlightDutyPeriod_QQ(duty);
				//7410 ANR
				calculateMaxFlightDutyPeriod_ANR(duty);
				//7484 HX
				calculateMaxFlightDutyPeriod_HX(duty);
				/*setDutyDiscretion_R5(duty);
				setDutyDiscretion_R4(duty);*/
			}
			else{
				setDutyDiscretion_2030(duty);
			}
			//6006 QQ设置机场休息设施
			setAirportRestFacilty_QQ(duty);

			//3007 MAX_FDP_PERDUTY 设置Max FDP
			setFDPPerDutyByDuty(duty);

			// 6107 QQ计算maxFDP for CC 根据配置，不配置则不计算
			calculateMaxFlighTime_QQ_CC(duty);

			//6020 QQ计算MaxFDP by Split Duty
			setMaxFlightDutyBySplitDuty_QQ(duty);

			//6025 LIMIT_MAX_DP_QQ
			calculateMaxDP_QQ(duty);

			//7028 TG 计算FDP Extension
			calculateSplitDutyMaxFDPExtension_TG(duty);

			//7017 TG CC 计算FTP扩展
			calculateMaxFDPExtension_TG_CC(duty);

			//7407 5J 计算Max FDP和Extension
			calculateDutyFdpAndExtensionFor5J(duty);

			apply3021MaxFdpBriefDelta(duty, pairingBase);
		}
	}
	//3010
	setDutyBuilderReq(duty);
	duty->calculateDutyValues(this->_application);
	//mantis#5082 在每次进行Brief/deBrief/pickUp/dropOff赋值前 先计算DomIntype
	duty->setDomIntType(Utility::GetInstancePtr()->getDutySegType(duty, &(this->_dbData->airportList)));
	setDutyDebrief(duty, pairingBase);
	setDutyDropoff(duty, pairingBase, beforeDuty, nextDuty);
	return true;
}
void LegalityChecker::setMinResBy121(Duty * duty, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::setMinResBy121");

	//MINRESTTIMEAFTERDUTY,MINRESTTIMEAFTERCROSSMIDDLENIGHTDUTY
	//10,12 (hours)
	Duty::DUTY_TYPE dt = duty->getType();

	if (dt != Duty::DUTY_FLY && dt != Duty::DUTY_PURE_OPR){
		return;
	}

	string header, headeValue;
	string strMinRest, strMinRestNightDuty, sMidNightStartBuffer;
	for (auto iter = singleRule->params.begin(); iter != singleRule->params.end(); iter++){
		header = iter->first;
		headeValue = iter->second;
		if (0 == strcmp(singleRule->storeType, "Mix"))
			transform(header.begin(), header.end(), header.begin(), ::toupper);
		//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
		//MINRESTTIMEAFTERDUTY,MINRESTTIMEAFTERCROSSMIDDLENIGHTDUTY,MIDDLENIGHTSTARTBUFFER
		if (header == "MINRESTTIMEAFTERDUTY") {
			strMinRest = headeValue;
		}
		if (header == "MINRESTTIMEAFTERCROSSMIDDLENIGHTDUTY") {
			strMinRestNightDuty = headeValue;
		}
		if (header == "MIDDLENIGHTSTARTBUFFER") {
			sMidNightStartBuffer = headeValue;
		}
	}
	try
	{
		int iMinRest = stoi(strMinRest)* 60;
		int iMinRestNight = stoi(strMinRestNightDuty) * 60;
		std::size_t iPos = sMidNightStartBuffer.find(":");
		int buffer = (iPos == string::npos) ?  0 : stoi(sMidNightStartBuffer.substr(0, iPos)) * 60 + stoi(sMidNightStartBuffer.substr(iPos + 1));
		time_t start = duty->getStartTimeUtcAct();
		time_t end = duty->getEndTimeUtcAct();
		string dept = duty->getDepStation();
		auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(dept);
		time_t localDayStartInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, iOffsetMinutes);
		time_t localDayEndInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, iOffsetMinutes) + 24 * 60 * 60 - buffer * 60;

		//duty cross mid-night
		if ((localDayStartInUtc > start) && (localDayEndInUtc < end))
			duty->setMinRest(iMinRestNight);
		else
			duty->setMinRest(iMinRest);

	}
	catch (...)  {
		duty->setMinRest(8 * 60);
	}

}


bool  LegalityChecker::reCalculateSingleRosterManday(SharedPtr<CREW> crew, SharedPtr<ROSTER> roster, bool operation)
{

	BasicCalculation calculator(this->_dbData, crew);
	calculator.setRuleEngine(this);

	calculator.calculateCommute(crew);

	bool bReturn = true;
	string dbg = "";
	time_t sce_start = this->_dbData->scenario.startDtUTC;
	time_t sce_end = this->_dbData->scenario.endDtUTC + 24 * 3600 - 1;
	try
	{
		dbg = "init";
		vector<SharedPtr<CREW_MANDAY_FD>>* dbMday = &(crew->mandayFdList);
		vector<SharedPtr<CREW_MANDAY_FD>>::iterator it;
		vector<SharedPtr<CREW_MANDAY_CC_AM>>* dbCCMday = &(crew->mandayCcAmList);
		vector<SharedPtr<CREW_MANDAY_CC_AM>>::iterator itCC;

		vector<SharedPtr<ROSTER>> rosters;// = crew->rosterList;

		bool isFD = (crew->division == "P");

		dbg = "new BasicCalculation";

		dbg = "calculator.setCalculatedObject";
		calculator.setCalculatedObject(roster);
		dbg = "calculator.calculate";
		calculator.calculate();
		calculatePairingDutyTimes(roster->pairing, _dbData.get());
		dbg = "calculator.calculateManDay";
		vector<SharedPtr<CREW_MANDAY_BASIC>> manday;

		//---------------------------------------------------------------
		time_t rangeStart = 0, rangeEnd = 0;
		map<time_t, SharedPtr<CREW_MANDAY_BASIC>> basics;
		if (_debug) //原先计算方式
			manday = calculator.calculateManDay();
		else //重构manday计算模块
		{
			if (this->_application == ROSTER_OPTIMIZER)
				rosters.push_back(roster);
			else {//re-calcate all rosters as it may change the forward/backward manday
				rosters = crew->rosterList;
				//20190110 ain, mantis#4736, ruleSrv总重算manday总重置整个场景范围以适应收尾删除操作
				rangeStart = this->_dbData->startUtc;
				rangeEnd = this->_dbData->endUtc;
			}
			basics = calculator.calculateManDays(rosters, true);
			if (basics.size() > 0)
			{
				for (map<time_t, SharedPtr<CREW_MANDAY_BASIC>>::iterator basic = basics.begin(); basic != basics.end(); ++basic)
				{
					manday.push_back(basic->second);
					if (basic == basics.begin())
						rangeStart = basic->first;
					rangeStart = min(rangeStart, basic->first);
					rangeEnd = max(rangeEnd, basic->first);
				}
			}
		}
		//---------------------------------------------------------------

		dbg = "isHalfRoster(roster)";
		bool isHalf = Utility::GetInstancePtr()->isHalfRoster(roster);
		dbg = "updateDowngrade";
		if (Utility::GetInstancePtr()->isTimeOverlap(this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600, roster->actStrUtc, roster->actEndUtc))
		{
			vector<SharedPtr<ROSTER>> rosters;
			rosters.push_back(roster);
			vector<DBRule> rules = RuleParams::GetInstancePtr()->getPatterRuleParams();
			vector<DBRule> rules8173 = RuleParams::GetInstancePtr()->getPatteByDaterRuleParams();
			dbg = "updateDowngrade - updatePatternStat";
			updatePatternStat(crew, rosters, rules, operation, sce_start, sce_end);
			updatePatternStatByDate(this->_dbData, crew, rosters, rules8173, operation, sce_start, sce_end);

			
			if (!operation)
			{
				dbg = "updateDowngrade - updateDowngrade";
				updateDowngrade(crew, roster, operation, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC);
			}
			dbg = "updateDowngrade - sortPatternList";
			RuleStatistics::GetInstancePtr()->sortPatternList();
		}

		dbg = "loop manday";
		if (this->_application == ROSTER_OPTIMIZER)
		{
			for (auto mday_iter = manday.begin(); mday_iter != manday.end(); mday_iter++)
			{
				//mantis#2320, 忽略空manday, 避免 delRoster后计算增量manday进入 operation=false->break逻辑
				if ((*mday_iter)->isEmpty()) {
					continue;
				}

				//定位 it/ itCC
				if (isFD)
				{
					dbg = "loop manday isFD";
					for (it = dbMday->begin(); it != dbMday->end(); ++it)
					{
						if ((*it)->dateLoc == (*mday_iter)->dateLoc)
						{
							break;
						}
					}
					dbg = "loop manday isFD end";
					if (it != dbMday->end())
					{
						dbg = "FD1";
						if (operation)
						{
							(*it)->addFrom(mday_iter->get(), isHalf);
						}
						else
						{
							(*it)->minusFrom(mday_iter->get(), isHalf);
						}

					}
					else
					{
						dbg = "FD2";
						if (operation)
						{
							SharedPtr<CREW_MANDAY_FD> item(new CREW_MANDAY_FD());
							item->copyFrom(mday_iter->get());
							dbMday->push_back(item);
						}

					}
				}
				else
				{
					dbg = "loop manday isFD else";
					for (itCC = dbCCMday->begin(); itCC != dbCCMday->end(); ++itCC)
					{
						if ((*itCC)->dateLoc == (*mday_iter)->dateLoc)
						{
							break;
						}
					}
					if (itCC != dbCCMday->end())
					{
						if (operation)
						{
							(*itCC)->addFrom(mday_iter->get(), isHalf);
						}
						else
						{
							(*itCC)->minusFrom(mday_iter->get(), isHalf);
						}
					}
					else
					{
						if (operation)
						{
							SharedPtr<CREW_MANDAY_CC_AM> item(new CREW_MANDAY_CC_AM());
							item->copyFrom(mday_iter->get());
							dbCCMday->push_back(item);
						}
					}
				}
			}
		}
		else
		{
			if (!isFD)
			{
				//20181020 ain, mantis#4302, manday增量计算以local为准
				for (itCC = dbCCMday->begin(); itCC != dbCCMday->end();)
				{
					if ((*itCC)->dateLoc >= rangeStart && (*itCC)->dateLoc <= rangeEnd)
					{
						itCC = dbCCMday->erase(itCC);
					}
					else
						++itCC;
				}
				for (auto& single : manday)
				{
					SharedPtr<CREW_MANDAY_CC_AM> item(new CREW_MANDAY_CC_AM());
					item->copyFrom(single.get());
					dbCCMday->push_back(item);
				}
			}
			else {
				map<time_t, SharedPtr<CREW_MANDAY_FD>> oldMandayFdMap;
				for (it = dbMday->begin(); it != dbMday->end();)
				{
					if ((*it)->dateLoc >= rangeStart && (*it)->dateLoc <= rangeEnd)
					{
						oldMandayFdMap[(*it)->dateLoc] = *it;
						it = dbMday->erase(it);
					}
					else
						++it;
				}
				for (auto& single : manday)
				{
					SharedPtr<CREW_MANDAY_FD> item(new CREW_MANDAY_FD());
					item->copyFrom(single.get());
					//恢复仅通过RuleTool计算的manday值
					recoverMandayFromRuleToolOnly(item, oldMandayFdMap);
					dbMday->push_back(item);
				}
			}
		}
		///TEST
		//if (crew->idCrew == "A99173") {
		//	cout << "MANDAY size=" << dbCCMday->size() << endl;
		//	for (auto& md : (*dbCCMday)) {
		//		if (md->crewDateUtc > utcStrToUtc("2018-7-29") && md->crewDateUtc < utcStrToUtc("2018-8-5"))
		//			cout << "MANDAY " << utcToUtcString(md->crewDateUtc) << " blh=" << md->blh << " dp=" << md->dp << " do=" << md->DAY_OFF << " lea=" << md->LEAVE << " sby=" << md->STANDBY << " hsb=" << md->HSB << " csb=" << md->CSB << endl;
		//	}
		//}
		if (operation &&
			Utility::GetInstancePtr()->isTimeOverlap(this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600, roster->actStrUtc, roster->actEndUtc))
		{
			dbg = "updateDowngrade - updateDowngrade";
			updateDowngrade(crew, roster, operation, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC);
		}
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("Exception: in reCalculateSingleRosterManday(), ex={} dbg={}, crewId:{}, rosterId:{}", ex.what(), dbg, crew->idCrew, roster->rosterId);
		bReturn = false;
	}
	catch (...) {
		Logger::getRuleLogger()->error("Exception in reCalculateSingleRosterManday fail, ex=general  dbg={} crewId:{}, rosterId:{}", dbg, crew->idCrew, roster->rosterId);
		bReturn = false;
	}
	return bReturn;
}

bool LegalityChecker::reCalculateCrewManday(SharedPtr<CREW>& crew, time_t startDtUtc, time_t endDtUtc){

	vector<SharedPtr<CREW_MANDAY_FD>>* dbMday = &(crew->mandayFdList);
	vector<SharedPtr<CREW_MANDAY_FD>>::iterator it;

	vector<SharedPtr<CREW_MANDAY_CC_AM>>* dbCCMday = &(crew->mandayCcAmList);
	vector<SharedPtr<CREW_MANDAY_CC_AM>>::iterator itCC;

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	//if (rosters.size() <= 0) {
	//dbMday->clear();
	//dbCCMday->clear();
	//return true;
	//}
	
	//20161028 add by ain: mantis#739
	//寻找指定时间 crew所在 base
	//根据base调整 start/end到 local day 
	//mantis#2445, endUtc按参数 endDtUtc 当日 23:59处理，避免外部默认时区(8)与crew base时区不同导致 endUtc计算少一天问题
	int crewBaseTimezoneOffsetMinutes = this->_dbData->getCrewBaseOffsetMinutes(crew->idCrew, startDtUtc);
	time_t startUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(startDtUtc, crewBaseTimezoneOffsetMinutes);
	time_t endUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(endDtUtc + 24 * 3600 - 1, crewBaseTimezoneOffsetMinutes) + 24 * 3600 - 1; //23:59

	bool isFD = (crew->division == "P");
	BasicCalculation calculator(this->_dbData, crew);
	calculator.setRuleEngine(this);

	//manday reset to zero
	time_t manStartLoc = startUtc + crewBaseTimezoneOffsetMinutes * 60;
	time_t manEndLoc = endUtc + crewBaseTimezoneOffsetMinutes * 60;
	//2024.6.3 [ROSCRW-4519]根据scenario开始结束时间前后+7天计算manday
	if (_dbData->scenario.scenarioId > 0) {
		//针对场景（非Live）情况下，扩展前后7天
		manStartLoc = startUtc + crewBaseTimezoneOffsetMinutes * 60 - 7 * 24 * 3600;
		manEndLoc = endUtc + crewBaseTimezoneOffsetMinutes * 60 + 7 * 24 * 3600;
	}
	//20190121 ain, mantis#4864, 重算manday过程reset()范围按 manday.dateLoc与 manStartLoc/ manEndLoc对比
	for (it = dbMday->begin(); it != dbMday->end(); ++it){
		if (((*it)->dateLoc >= manStartLoc) && ((*it)->dateLoc <= manEndLoc))
			(*it)->reset();
	}
	for (itCC = dbCCMday->begin(); itCC != dbCCMday->end(); ++itCC){
		if (((*itCC)->dateLoc >= manStartLoc) && ((*itCC)->dateLoc <= manEndLoc))
			(*itCC)->reset();
	}
	if (rosters.size() <= 0) {
		return true;
	}

	if (_debug)
	{
		bool isHalf = false;
		for (auto& iter:rosters)
		{
			if (iter->actRestStrUtc < manStartLoc || iter->actStrUtc > manEndLoc)
				continue;

			iter->isCalculated = true;

			calculator.setCalculatedObject(iter);
			calculator.calculate();
			calculatePairingDutyTimes(iter->pairing, _dbData.get());
			vector<SharedPtr<CREW_MANDAY_BASIC>> manday = calculator.calculateManDay();
			isHalf = Utility::GetInstancePtr()->isHalfRoster(iter);
			if (isFD)
			{
				//vector<SharedPtr<CREW_MANDAY_BASIC>> manday = calculateManDay(this->_dbData, crew->idCrew, (*iter));
				for (auto mday_iter = manday.begin(); mday_iter != manday.end(); mday_iter++)
				{
					if (!(((*mday_iter)->crewDateUtc >= manStartLoc) && ((*mday_iter)->crewDateUtc <= manEndLoc)))
					{
						continue;
					}
					for (it = dbMday->begin(); it != dbMday->end(); ++it){
						if ((*it)->crewDateUtc == (*mday_iter)->crewDateUtc){
							break;
						}
					}
					if (it != dbMday->end()){
						(*it)->addFrom(mday_iter->get(), isHalf);
					}
					else
					{
						SharedPtr<CREW_MANDAY_FD> item(new CREW_MANDAY_FD());
						item->copyFrom(mday_iter->get());
						dbMday->push_back(item);
					}
				}
			}
			else
			{

				for (auto mday_iter = manday.begin(); mday_iter != manday.end(); mday_iter++)
				{
					if (!(((*mday_iter)->crewDateUtc >= manStartLoc) && ((*mday_iter)->crewDateUtc <= manEndLoc)))
					{
						continue;
					}
					for (itCC = dbCCMday->begin(); itCC != dbCCMday->end(); ++itCC){
						if ((*itCC)->crewDateUtc == (*mday_iter)->crewDateUtc){
							break;
						}
					}
					if (itCC != dbCCMday->end()){
						(*itCC)->addFrom(mday_iter->get(), isHalf);
					}
					else
					{
						SharedPtr<CREW_MANDAY_CC_AM> item(new CREW_MANDAY_CC_AM());
						item->copyFrom(mday_iter->get());
						dbCCMday->push_back(item);
					}
				}
			}
		}
	}
	else //manday新计算方式
	{
		map<time_t, SharedPtr<CREW_MANDAY_BASIC>> basics = calculator.calculateManDays(rosters, true);
		for (map<time_t, SharedPtr<CREW_MANDAY_BASIC>>::iterator basic = basics.begin(); basic != basics.end(); ++basic)
		{
			if (!((basic->first >= manStartLoc) && (basic->first <= manEndLoc)))
				continue;
			if (isFD)
			{
				for (it = dbMday->begin(); it != dbMday->end(); ++it){
					//20180922 ain, mantis#4131, 按manday.dateLoc合并汇总, 因不同类型roster按不同timezone切天导致无法按utc合并
					if ((*it)->dateLoc == basic->first){
						break;
					}
				}
				if (it != dbMday->end()){
					(*it)->addFrom(&*basic->second, false);
				}
				else
				{
					SharedPtr<CREW_MANDAY_FD> item(new CREW_MANDAY_FD());
					item->copyFrom(&*basic->second);
					dbMday->push_back(item);
				}
			}
			else
			{
				for (itCC = dbCCMday->begin(); itCC != dbCCMday->end(); ++itCC){
					//20180922 ain, mantis#4131, 按manday.dateLoc合并汇总, 因不同类型roster按不同timezone切天导致无法按utc合并
					if ((*itCC)->dateLoc == basic->first){
						break;
					}
				}
				if (itCC != dbCCMday->end()){
					(*itCC)->addFrom(&*basic->second, false);
				}
				else
				{
					SharedPtr<CREW_MANDAY_CC_AM> item(new CREW_MANDAY_CC_AM());
					item->copyFrom(&*basic->second);
					dbCCMday->push_back(item);
				}

			}

		}
		//增加检查流程，如果当天的dp和ft等于0，刷新起飞降落数
		for (it = dbMday->begin(); it != dbMday->end(); ++it) {
			if (((*it)->dateLoc >= manStartLoc) && ((*it)->dateLoc <= manEndLoc) && (*it)->dp == 0 && (*it)->blh == 0) {
				if ((*it)->takeoff > 0 || (*it)->landing > 0 || (*it)->updowns > 0) {
					(*it)->takeoff = 0;
					(*it)->landing = 0;
					(*it)->updowns = 0;
				}
			}
		}
	}
	///TEST
	//if (crew->idCrew == "A37626") {
	//	std::sort(crew->mandayCcAmList.begin(), crew->mandayCcAmList.end(), [](SharedPtr<CREW_MANDAY_CC_AM>& a, SharedPtr<CREW_MANDAY_CC_AM>& b) {
	//		return a->crewDateUtc < b->crewDateUtc;
	//	});
	//	cout << "MANDAY size=" << dbCCMday->size() << endl;
	//	for (auto& md : (*dbCCMday)) {
	//		if (md->crewDateUtc > utcStrToUtc("2018-8-29") && md->crewDateUtc < utcStrToUtc("2018-10-1"))
	//			cout << "MANDAY " << utcToUtcString(md->dateLoc) << " " << utcToUtcString(md->crewDateUtc) 
	//				<< " blh=" << md->blh << " dp=" << md->dp << " do=" << md->DAY_OFF << " lea=" << md->LEAVE << " sby=" << md->STANDBY << " hsb=" << md->HSB << " csb=" << md->CSB << " GND=" << md->GND 
	//				<< endl;
	//	}
	//}
	return true;
}

bool LegalityChecker::recoverMandayFromRuleToolOnly(SharedPtr<CREW_MANDAY_FD>& newManday, map<time_t, SharedPtr<CREW_MANDAY_FD>>& oldMandayMap) {
	auto iterOld = oldMandayMap.find(newManday->dateLoc);
	if (iterOld != oldMandayMap.end()) {
		auto oldManday = static_cast<CREW_MANDAY_FD*>(iterOld->second.get());
		newManday->landing = oldManday->landing;
		newManday->takeoff = oldManday->takeoff;
		newManday->updowns = oldManday->updowns;
		newManday->cat2Updowns = oldManday->cat2Updowns;
	}
	return true;
}

bool LegalityChecker::getMan(string crewid, long long rosterid)
{
	int iIndex = this->getCrewIndex(crewid);
	if (iIndex < 0)
		return false;
	SharedPtr<ROSTER> roster;
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[iIndex]->rosterList;

	for (vector<SharedPtr<ROSTER>>::iterator it_roster = rosters.begin(); it_roster != rosters.end(); it_roster++)
	{
		if ((*it_roster)->rosterId == rosterid)
		{
			roster = (*it_roster);
			break;
		}
	}
	if (roster){
		//20180116 ain, comment, 冗余逻辑未对数据产生效果
		BasicCalculation calculator(this->_dbData, this->_dbData->crewList[iIndex]);
		calculator.setRuleEngine(this);
		calculator.setCalculatedObject(roster);
		calculator.calculate();
		calculatePairingDutyTimes(roster->pairing, _dbData.get());
		vector<SharedPtr<CREW_MANDAY_BASIC>> mans = calculator.calculateManDay();
	}
	return true;
}

void LegalityChecker::outputRules()
{
	ofstream outFile("output_rules.txt");
	for (std::size_t i = 0; i < _appRules.size(); i++) {
		outFile << _appRules[i].idRule << "\n";
	}
	outFile.close();
}

vector<DBRule> LegalityChecker::filterRules(const vector<DBRule>& rules, const int application) const
{
	vector<DBRule> retList;
	for (vector<DBRule>::const_iterator rule = rules.begin(); rule != rules.end(); rule++)
	{
		if (_dbData->IsSupportRulePhaseConfig()) {
			retList.emplace_back((*rule));
		}
		else {
			if ((application == PAIRING_OPTIMIZER && strcmp((*rule).classType, "R\n") != 0) ||
				(application == ROSTER_OPTIMIZER && strcmp((*rule).classType, "P\n") != 0) ||
				(application != PAIRING_OPTIMIZER && application != ROSTER_OPTIMIZER)
				)
			{
				//mantis# 6599, PO只检查planning法规, RO只检擦planning法规且不检查PO法规
				if (application == PAIRING_OPTIMIZER && (*rule).phase != (int)PHASE::PHASE_PLANNING && (*rule).phase != (int)PHASE::PHASE_ALL) {
					continue;
				}
				string classType = (*rule).classType;
				if (application == ROSTER_OPTIMIZER && ((classType != "R" && classType != "B")
					|| ((classType == "R" || classType == "B") && (*rule).phase != (int)PHASE::PHASE_PLANNING && (*rule).phase != (int)PHASE::PHASE_ALL))) {
					continue;
				}

				retList.emplace_back((*rule));
			}
		}
	}
	return retList;
}

vector<DBRule> LegalityChecker::filterRules(const long long ruleSetId, const vector<std::shared_ptr<RuleSet>>& ruleSetList, const vector<DBRule>& allRules, const int application) const {
	vector<DBRule> retList;
	set<long long> ruleIds;
	std::for_each(ruleSetList.begin(), ruleSetList.end(), [ruleSetId, &ruleIds](const std::shared_ptr<RuleSet>& ruleSet) {
			if (ruleSet->worksetId == ruleSetId) {
				ruleIds.emplace(ruleSet->ruleId);
			}
		});

	for (vector<DBRule>::const_iterator rule = allRules.begin(); rule != allRules.end(); rule++)
	{
		if (ruleIds.find(rule->idRule) == ruleIds.end()) {
			continue;
		}
		if (_dbData->IsSupportRulePhaseConfig()) {
			retList.emplace_back((*rule));
		}
		else {
			if ((application == PAIRING_OPTIMIZER && strcmp((*rule).classType, "R\n") != 0) ||
				(application == ROSTER_OPTIMIZER && strcmp((*rule).classType, "P\n") != 0) ||
				(application != PAIRING_OPTIMIZER && application != ROSTER_OPTIMIZER)
				)
			{
				//mantis# 6599, PO只检查planning法规, RO只检擦planning法规且不检查PO法规
				if (application == PAIRING_OPTIMIZER && (*rule).phase != (int)PHASE::PHASE_PLANNING && (*rule).phase != (int)PHASE::PHASE_ALL) {
					continue;
				}
				string classType = (*rule).classType;
				if (application == ROSTER_OPTIMIZER && ((classType != "R" && classType != "B")
					|| ((classType == "R" || classType == "B") && (*rule).phase != (int)PHASE::PHASE_PLANNING && (*rule).phase != (int)PHASE::PHASE_ALL))) {
					continue;
				}

				retList.emplace_back((*rule));
			}
		}
	}
	return retList;
}

void LegalityChecker::sortRulesByNumOfVoliation()
{
	if (_appRules.size() > 0)
	{
		std::stable_sort(_appRules.begin(), _appRules.end(), ruleCmp);
	}
}


//for roster Editor 
bool LegalityChecker::checkRules(int crewIndex)
{
	DBG_HELP("LegalityChecker::checkRules(int crewIndex)");

	for (vector<RULE_VIOLATION *>::iterator it = _rule_violations.begin(); it != _rule_violations.end(); it++)
	{
		if (NULL != *it)
		{
			delete *it;
			*it = NULL;
		}
	}
	_rule_violations.clear();
	vector<RULE_VIOLATION*>(_rule_violations).swap(_rule_violations);

	_violations.clear();
	vector<string>(_violations).swap(_violations);

	this->setApplication(ROSTER_EDITOR);
	vector<RULE_LEGALITY *> checkList;

	RULE_LEGALITY* singleCrew = new RULE_LEGALITY();
	singleCrew->crewIndex = crewIndex;
	checkList.push_back(singleCrew);
	bool bReturn = this->checkRules(checkList);

	delete singleCrew;
	return bReturn;

}



bool LegalityChecker::checkSegsInSameDuty(vector<Segment*>& segments){

	static string SplitDuty = this->_dbData->systemParamMap["SPLIT_DUTY"];
	std::size_t iPos = SplitDuty.find(":");
	int64_t checkTime = 10 * 3600;
	if (iPos != string::npos)
		checkTime = stoi(SplitDuty.substr(0, iPos)) * 3600 + stoi(SplitDuty.substr(iPos + 1)) * 60;
	int lastTime = 0;
	for (std::size_t i = 1; i < segments.size(); i++){
		if (static_cast<int>(segments[i]->getStartTimeUtcAct() - segments[i - 1]->getEndTimeUtcAct()) > checkTime){
			return false;
		}
	}
	return true;
}

void LegalityChecker::copyTransactionData(const LegalityChecker* srcChecker) {
	this->_scenarioID = srcChecker->_scenarioID;
	this->_window_start = srcChecker->_window_start;
	this->_window_end = srcChecker->_window_end;
	this->_reportQuals = srcChecker->_reportQuals;
	this->_airportQuals = srcChecker->_airportQuals;
	this->_restAssignments = srcChecker->_restAssignments;
}

//开始事务与结束事务成对调用，每次法规检查开启事务
void LegalityChecker::startTransaction() {
	_transactionRosterPairingDbIdMap.clear();
	auto now = std::chrono::high_resolution_clock::now();
	//使用纳秒,理论存在重复可能性
	_transactionId = std::chrono::duration<long long, std::nano>(now.time_since_epoch()).count();
	Logger::getRuleLogger()->info("[startTransaction] transactionId:{}", _transactionId);
}

//结束事务
void LegalityChecker::endTransaction() {
	_transactionRosterPairingDbIdMap.clear();
	Logger::getRuleLogger()->info("[endTransaction] transactionId:{}", _transactionId);
}

void LegalityChecker::cleanViolations()
{
	// PO中如果部分法规填充了violation，会线程不安全
	if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
		return;

	for (vector<RULE_VIOLATION *>::iterator it = _rule_violations.begin(); it != _rule_violations.end(); ++it)
	{
		if (NULL != *it)
		{
			delete *it;
			*it = NULL;
		}
	}
	_rule_violations.clear();
	vector<RULE_VIOLATION*>(_rule_violations).swap(_rule_violations);

	_violations.clear();
	vector<string>(_violations).swap(_violations);
}

bool LegalityChecker::checkRules(vector<RULE_LEGALITY*> checkList) 
{
	unordered_map<long long, tuple<int, int>> dutyLimitsMap;
	if (this->_application == ROSTER_OPTIMIZER) {
		//获得Pairing阶段的Duty的MinRest、MaxFDP值
		dutyLimitsMap = getDutyLimitsMap(checkList, this->_dbData);//map<dutyId, tuple<minRest,maxFDP>>
	}

	bool valid = checkRulesImpl(checkList);
	
	if (this->_application == ROSTER_OPTIMIZER) {
		//基于Crew法规会修改Duty的MinRest和MaxFDP, 这里恢复原Pairing阶段的Duty的MinRest、MaxFDP值
		setDutyLimitsMap(dutyLimitsMap, checkList, this->_dbData);
	}
	return valid;
}

inline static bool compareMandayFd(SharedPtr<CREW_MANDAY_FD>& i, SharedPtr<CREW_MANDAY_FD>& j) { return (i->crewDateUtc < j->crewDateUtc); }
inline static bool compareMandayCc(SharedPtr<CREW_MANDAY_CC_AM>& i, SharedPtr<CREW_MANDAY_CC_AM>& j) { return (i->crewDateUtc < j->crewDateUtc); }

bool LegalityChecker::checkRulesImpl(vector<RULE_LEGALITY *>& checkList)
{
	callCount++;
	clock_t ruleBegin = clock();
	DBG_HELP("LegalityChecker::checkRules(vector<RULE_LEGALITY *> checkList)");

	if (this->_application == ROSTER_OPTIMIZER &&
		(callCount == 1000 || callCount == 10000 || callCount == 50000 || callCount == 200000
		|| callCount == 800000 || callCount == 3000000 || callCount == 10000000 || callCount == 20000000
		|| callCount == 50000000 || callCount == 80000000 || callCount == 120000000))
		sortRulesByNumOfVoliation();
	//debug - start
	bool _debug_RO = false;
	//debug - end
	//custRules->setData(this->_application, this->_dbData);

	long long dbgRuleId = 0;
	int dbgCrewIndex = 0;
	string dbgCrewId = "";

	bool isValid = true;
	if (_debug)
		Logger::getRuleLogger()->info("Prepare Rule Engine:");
	vector<int> tempRules;

	clock_t lapsed, lpased2;

	try
	{
		cleanViolations();
		//第一步检查或设置行相关的法规
		time_t currTimeUtc = Utility::GetInstancePtr()->getCurrentTimeInUTC(_dbData);
		for (vector<RULE_LEGALITY*>::iterator ix = checkList.begin(); ix != checkList.end(); ++ix)
		{
			dbgCrewIndex = (*ix)->crewIndex;
			dbgCrewId = this->_dbData->crewList[dbgCrewIndex]->idCrew;

			SharedPtr<CREW> crew = this->_dbData->crewList[(*ix)->crewIndex];
			//刷新crew的roster index
			this->_dbData->refreshRosterIndexOfCrew(crew);

			for (auto& roster : crew->rosterList) {
				roster->clearLimitation();
				roster->dutyValues.clearDiscretion();
				roster->dutyValues.clearDeduction();
			}

			//计算Crew的Roster当前所属phase
			this->_dbData->calcuateRulePhases(crew, currTimeUtc);

			vector<SharedPtr<CREW_MANDAY_CC_AM>>& man_cc = crew->mandayCcAmList;
			vector<SharedPtr<CREW_MANDAY_FD>>&    man_fd = crew->mandayFdList;
			bool isFd = crew->division == "P";
			//sort
			if (isFd)
				std::sort(man_fd.begin(), man_fd.end(), compareMandayFd);
			else
				std::sort(man_cc.begin(), man_cc.end(), compareMandayCc);


			//TRAINING_BRIEF_AND_DEBRIEF(7228)
			dbgRuleId = 7228;
			calculateTrainingBriefAndDebrief(*ix);

			vector<Duty*> tempDuties;
			dbgRuleId = 8093;
			(*ix)->isLegal = checkMinRestByType(tempDuties, crew);
			dbgRuleId = 8094;
			(*ix)->isLegal = (*ix)->isLegal && checkMinRestBeforeDutyByLength(tempDuties, crew);
			dbgRuleId = 8095;
			(*ix)->isLegal = (*ix)->isLegal && checkExtendRestBeforeDuty(tempDuties, crew);
			dbgRuleId = 8099;
			(*ix)->isLegal = (*ix)->isLegal && chekcMinRestBeforeDutyByDP(tempDuties, crew);

			//pairing editor or optimizer call
			if ((*ix)->crewIndex < 0 && (*ix)->PairingIndex >= 0)
			{
				int iPgRet = checkPGRules(this->_dbData->pairingList[(*ix)->PairingIndex], tempRules, this->_application);
				continue;
			}
			vector<SharedPtr<ROSTER>>&  rosters = crew->rosterList;
			if ((*ix)->RosterIndex >= 0 && (*ix)->RosterIndex >= (int)rosters.size())
			{
				Logger::getRuleLogger()->error("Assert Error: crew({}),roster index({}) exceeds the roster size.", (*ix)->crewIndex, (*ix)->RosterIndex);
				return true;
			}

			dbgRuleId = 7000;
			setAcclimationStateOfEASA(rosters);//7000
			dbgRuleId = 7400;
			setAcclimationStateOfANR(rosters);//7400
			dbgRuleId = 6005;
			setAcclimationState_QQ(rosters);//6005
			dbgRuleId = 7482;
			setAcclimationStateForHX(rosters);//7482
			dbgRuleId = 7500;
			setAcclimationStateForCARS(rosters);//7500
			//set call additional callin standby FDP in the callin FLY roster
			calcualteCallinSbyFDP(this->_dbData, crew, RuleParams::GetInstancePtr()->getStandbyAssignments());

			dbgRuleId = 7363;
			calculateInexperiencedCrewFor5J(*ix);

			//BasicCalculation calculator(this->_dbData, this->_dbData->crewList[(*ix)->crewIndex]);
			//calculator.calculateManDays(rosters, true);

			if (this->_application != ROSTER_OPTIMIZER)
			{
				for (vector<RULE_LEGALITY*>::iterator ix = checkList.begin(); ix != checkList.end(); ++ix)
				{
					vector<SharedPtr<ROSTER>>&  rosters = this->_dbData->crewList[(*ix)->crewIndex]->rosterList;
					if ((*ix)->RosterIndex >= 0 && (*ix)->RosterIndex >= (int)rosters.size())
					{
						clock_t ruleTime = clock() - ruleBegin;
						RuleStatistics::GetInstancePtr()->addRuleCallClock(0, ruleTime);
						RuleStatistics::GetInstancePtr()->addRuleCallTimes(0, 1);
						printf("Assert Error: crew(%d),roster index(%d) exceeds the roster size.\n", (*ix)->crewIndex, (*ix)->RosterIndex);
						return true;
					}
					size_t iRoster = 0;
					for (; iRoster < rosters.size(); ++iRoster)
					{
						if (!(rosters[iRoster]->pairing)) {
							// 计算地面任务DP
							calculateRosterDP(rosters[iRoster].get(), _dbData.get());
							continue;
						}
						//rosters[iRoster]->pairing->calcuate(maps);
						//20181016 ain, 重构 fdp/dp/bh计算
						calculatePairingDutyTimes(rosters[iRoster]->pairing, _dbData.get());
					}
				}

			}

			dbgRuleId = 7481;
			setRedEyeDutyForHX(rosters);//7481 红眼任务计算必须在DP计算之后

			//dbgRuleId = 7465;
			//setMinScheDaysOffAtBaseForSQ(*ix);

			//dbgRuleId = 7466;
			//setExtraDaysOffAtBaseForSQ(*ix);

			for (size_t iRoster = 0; iRoster < rosters.size(); ++iRoster)
			{
				if (rosters[iRoster]->pairing == nullptr) {
					//7488(计算地面任务的最小休息时间)
					dbgRuleId = 7488;
					setMinRestForHX(rosters[iRoster]);
				}

				dbgRuleId = 8104;
                checkMaxGround(rosters[iRoster].get());
				if (!(rosters[iRoster]->pairing))
					continue;

				// RO新分配的任务，重新计算PIC
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					if (rosters[iRoster]->needRuleCheck) {
						const auto & segments = rosters[iRoster]->pairing->getSegmentsRead();
						for (const auto& seg : segments) {
							this->_dbData->flightPICMap[seg->getDBId()] = "";
						}
					}
				}

				Pairing* pg = rosters[iRoster]->pairing;
				if (!(pg->isInitialized()))
				{
						vector<Duty *> dutylist = pg->getDutyVec();
						setSplitDuty(dutylist);
						for (int iDuty = 0; iDuty < (int)dutylist.size(); ++iDuty)
						{
							Duty * duty = dutylist[iDuty];
							Duty::DUTY_TYPE dt = duty->getType();
							if (dt == Duty::DUTY_BLANK_DAY || dt == Duty::DUTY_PAIRING_REST){
								continue;
							}
							duty->calculateDutyValues(this->_application);
							//op#2163 移除duty 五件套初始化
							/*setDutyBuilderReq(duty);*/
							//op#2128 setDirection
							if (pg->getDivision() == "P"){
								dbgRuleId = 6007;
								calculateMaxFlightDutyPeriod_QQ(duty, rosters[iRoster]);

								//7410 ANR
								dbgRuleId = 7410;
								calculateMaxFlightDutyPeriod_ANR(duty);

								//7484 HX
								dbgRuleId = 7484;
								calculateMaxFlightDutyPeriod_HX(duty, rosters[iRoster]);
								/*setDutyDiscretion_R5(duty);
								setDutyDiscretion_R4(duty);*/
							}
							else{
								dbgRuleId = 2003;
								setDutyDiscretion_2030(duty);
							}

							//7300 CALC_MAX_DUTY_TIME_FOR_PR
							dbgRuleId = 7300;
							setMaxDP_PR(duty);

							//7303 CALC_MAX_DP_PER_AVG_BLH_OF_CBA_FOR_PR
							dbgRuleId = 7303;
							setMaxDPPerAvgBLHOfCBA_PR(duty);

							//6006 QQ设置机场休息设施
							dbgRuleId = 6006;
							setAirportRestFacilty_QQ(duty);

							//3007 MAX_FDP_PERDUTY 设置Max FDP
							dbgRuleId = 3007;
							setFDPPerDutyByDuty(duty);

							// 6107 QQ计算maxFDP for CC 根据配置，不配置则不计算
							dbgRuleId = 6107;
							calculateMaxFlighTime_QQ_CC(duty);

							//6020 QQ计算MaxFDP by Split Duty
							dbgRuleId = 6020;
							setMaxFlightDutyBySplitDuty_QQ(duty);

							//6025 LIMIT_MAX_DP_QQ
							dbgRuleId = 6025;
							calculateMaxDP_QQ(duty);

							//mantis#5082 在每次进行Brief/deBrief/pickUp/dropOff赋值前 先计算DomIntype
							//duty->setDomIntType(Utility::GetInstancePtr()->getDutySegType(duty, &(this->_dbData->airportList)));
							//setDutyBrief(duty);
							//setDutyDebrief(duty);
							//setDutyPickup(duty);
							//setDutyDropoff(duty);
							//checkMinConnBetwDIP(duty);

							//7028 TG 计算FDP Extension
							calculateSplitDutyMaxFDPExtension_TG(duty);

							//7017 TG CC 计算FTP扩展
							dbgRuleId = 7017;
							calculateMaxFDPExtension_TG_CC(duty);

							//7407 5J 计算Max FDP和Extension
							calculateDutyFdpAndExtensionFor5J(duty);

							calculateMaxFlightDutyPeriod_HX(duty);

							apply3021MaxFdpBriefDelta(duty, pg->getBase());

							//GEN_MIN_REST
							dbgRuleId = 2124;
							if (iDuty == (int)dutylist.size() - 1)
								for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::GEN_MIN_REST))
									setMinRest(duty, &singleRule, iDuty, rosters[iRoster]);
							if (this->_dbData->getRuleFunctions(RULES::CALCULATE_COURSE_FDP_FOR_TG).size() > 0) {
								dbgRuleId = 7278;
								int fdp = CalculateCourseDutyFDPForTG(duty, rosters[iRoster]);
								duty->setActualFDP(fdp);
								duty->setPlanFDP(fdp);
							}
							
						}
					setULR(pg);
				}

				//7301
				if (iRoster != 0) {
					CalculateDPForPR(rosters[iRoster - 1], rosters[iRoster], _dbData);
				}
				// 计算最后一个roster是否包含dhd
				if (iRoster == rosters.size() - 1) {
					SharedPtr<ROSTER> roster;
					CalculateDPForPR(rosters[iRoster], roster, _dbData);
				}
				
				//7021
				dbgRuleId = 7021;
				setMinRestByDP_TG(rosters[iRoster]);

				//7023
				dbgRuleId = 7023;
				setMinRestAtLayover_TG(rosters[iRoster]);

				////7024
				//dbgRuleId = 7024;
				//setMinRestAtBaseForTG(rosters[iRoster]);

				//7100
				dbgRuleId = 7100;
				setMinRest_EvaFd(rosters[iRoster]);

				//7488(基于Pairing维度调用)
				dbgRuleId = 7488;
				setMinRestForHX(rosters[iRoster]->pairing);

				////7465
				//dbgRuleId = 7465;
				//setMinScheDaysOffAtBaseForSQ(rosters[iRoster]);

				////7466
				//dbgRuleId = 7466;
				//setExtraDaysOffAtBaseForSQ(rosters[iRoster]);

				//7412
				dbgRuleId = 7412;
				setMinimumRestPeriodForSQRule(rosters[iRoster]);

				//7200
				dbgRuleId = 7200;
				setCheckInMinRest_EvaFd(rosters[iRoster]);

				//8080
				//setMinRestByFDP(pg, roster[iRoster]->callinSBY_FDPMins);
				dbgRuleId = 8080;
				setMinRestByFDP(pg, rosters[iRoster]);//20181027 ain, mantis4217

				//for other applications, check the basic rules, such as minimal FDP/DP/MIN REST
				//if (this->_application != ROSTER_OPTIMIZER)
				//	checkMinRest(pg);

				//pg->setInitialIndicator(true);

				//7311
				dbgRuleId = 7311;
				setMinRestByBlockTime_PR(rosters[iRoster]);

				//7492
				dbgRuleId = 7492;
				setMaxFdpExtensionForSplitDutyForHX(rosters[iRoster]);
			}

			//7373
			dbgRuleId = 7373;
			calculateGroundRosterMinRestFor5J(rosters);

			//7374
			dbgRuleId = 7374;
			calculateMaxFDPByCalloutFor5J(rosters);

			//7024
			dbgRuleId = 7024;
			setMinRestAtBaseForTG(rosters);

			//6024
			dbgRuleId = 6024;
			calculateMaxFdpForStand_QQ(rosters);

			//7018
			dbgRuleId = 7018;
			calculateMaxFdpOnStandbyOfCc_TG(rosters);

			////7302
			//dbgRuleId = 7302;
			//calculateMaxFDPByCalloutStandbyForPR(rosters);

			//MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD(7211)
			dbgRuleId = 7211;
			setMinRestAfterCumulativeFT_EvaFd(*ix);

			//CALC_FDP_EXTENSION_WITH_INFLIGHT_REST_OF_CC_FOR_TG(7029)
			dbgRuleId = 7029;
			calculateFdpExtensionWithInFlightRestOfCcForTG(rosters);

			//CALCULATE_PIF_FOR_EVA_FD(7260)
			dbgRuleId = 7260;
			calculatePICForEva(rosters);

			//REDUCE_ODP_AT_BASE_QQ(6101)
			dbgRuleId = 6101;
			reduceMinRestAtBase_QQ(*ix);

			//REDUCE_ODP_AWAY_FROM_BASE_QQ(6102)
			dbgRuleId = 6102;
			reduceMinRestAwayFromBase_QQ(*ix);

			//7022
			setMinRestReduce_TG(rosters);

			time_t start = this->_dbData->scenario.startDtUTC;
			time_t end = this->_dbData->scenario.endDtUTC;
			this->reCalculateCrewManday(crew, start, end);

			//重新计算Crew的manday当前所属phase
			int mainBaseTimeZone = this->_dbData->getMainBaseTimeZone();
			for (auto& manday : crew->mandayFdList) {
				this->_dbData->calcuateRulePhases(manday.get(), crew, currTimeUtc, mainBaseTimeZone);
			}

			for (auto& manday : crew->mandayCcAmList) {
				this->_dbData->calcuateRulePhases(manday.get(), crew, currTimeUtc, mainBaseTimeZone);
			}

			//合并DP和FDP之后，重新调整MinRest
			for (size_t iRoster = 0; iRoster < rosters.size(); ++iRoster)
			{
				//7021
				dbgRuleId = 7021;
				setMinRestByDP_TG(rosters[iRoster]);

				//7311
				dbgRuleId = 7311;
				setMinRestByBlockTime_PR(rosters[iRoster]);
			}

			//合并DP和FDP之后，重新调整MaxFDP
			//7302
			dbgRuleId = 7302;
			calculateMaxFDPByCalloutStandbyForPR(rosters);
			
			//7488(基于Roster维度调用)
			dbgRuleId = 7488;
			setMinRestForHX(*ix);

			//7484
			dbgRuleId = 7484;
			calculateMaxFlightDutyPeriod_HX(*ix);
	
			resetMinRestForOverlapRosters(crew);

			//7490
			setMaxFdpExtensionForHX(*ix);

			//7491
			setMaxFdpExtensionForCcForHX(*ix);

			//7272
			CalculateStandbyDP_TG(rosters);

			//7372
			CalculateGroundDP_TG(rosters);

			//2001
			dbgRuleId = 2001;
			setManualLimit(*ix);

			//7307 (所有计算MinRest之后最后调用)
			dbgRuleId = 7307;
			setMinRestBasedLocalNightForPR(*ix);

			// =========================================================================
			// CRITICAL EXECUTION ORDER: autoConfigDutyValues() vs setAccStartAtBaseForRT()
			// =========================================================================
			//
			// autoConfigDutyValues() copies Duty-level values to Roster-level:
			//   - duty.getAcclimatisedState() -> roster.dutyValues.setAccState()
			//   - duty.getRefTimeZone() -> roster.dutyValues.setRefTimeZone()
			//
			// Rule 7024-2 (setAccStartAtBaseForRT) sets Roster-level values directly:
			//   - roster.dutyValues.setAccState(0, "D")
			//   - roster.dutyValues.setRefTimeZone(0, baseOffsetTZMinutes)
			//
			// Execution order:
			//   1. Duty-level rules execute (setMinRestAtBaseForTG, etc.)
			//   2. autoConfigDutyValues() copies Duty values to Roster
			//   3. Roster-level rules execute (setAccStartAtBaseForRT) - AFTER copying
			//
			// If setAccStartAtBaseForRT runs BEFORE autoConfigDutyValues(),
			// its Roster-level accState="D" gets overwritten by Duty-level accState="X".
			// =========================================================================

			// 设置Roster的DutyValue值，复制Duty级别的值到Roster级别
			// 此步骤在所有Duty级别计算法规执行之后调用
			for (auto& roster : rosters) {
				roster->autoConfigDutyValues();
			}

			// 7024-2: 设置Roster级别的适应状态 (必须在autoConfigDutyValues之后调用)
			// 原因: 此规则直接设置Roster.dutyValues的accState和refTimeZone
			//       如果在autoConfigDutyValues之前调用，会被Duty级别的值覆盖
			dbgRuleId = 7024;
			setAccStartAtBaseForRT(rosters);
		}

		//No.2 Check rules
		if (_debug)
			Logger::getRuleLogger()->info("Prepare Rule Engine end and start check rules");

		for (vector<RULE_LEGALITY*>::iterator ix = checkList.begin(); ix != checkList.end(); ++ix)
		{
			isValid = true;
		
			//rule 集体检查逻辑
			auto& rule3008 = this->_dbData->getRuleFunctions(RULES::MAX_BLOCK_PERDUTY);
			if (rule3008.size()){
				dbgRuleId = RULES::MAX_BLOCK_PERDUTY;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkBlockPerDuty_Roster(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule3008[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule3008[0].idRule, 1);
				if (_debug)
					Logger::getRuleLogger()->info("crew {} :check max block per duty rule.", (*ix)->crewIndex);
			}
			
			auto& rule3007 = this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY);
			if (rule3007.size()){
				dbgRuleId = RULES::MAX_FDP_PERDUTY;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkFDPPerDuty_Roster(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule3007[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule3007[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max FDP per duty rule.\n", (*ix)->crewIndex);
			}
			
			auto& rule7485 = this->_dbData->getRuleFunctions(RULES::CHECK_COMPOSITION_REQUIREMENT_FOR_HX);
			if (rule7485.size()){
				dbgRuleId = RULES::CHECK_COMPOSITION_REQUIREMENT_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCompositionRequirement_HX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7485[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7485[0].idRule, 1);
				if (_debug)
					printf("crew %d :check composition requirement rule.\n", (*ix)->crewIndex);
			}



			/*auto& rule6107 = this->_dbData->getRuleFunctions(RULES::MAX_FLIGHT_TIME_QQ_CC);
			if (rule6107.size()) {
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxFlightTime_QQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6107[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6107[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max FDP time rule.\n", (*ix)->crewIndex);
				
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6107 << endl;
					return false;
				}
			}

			auto& rule6007 = this->_dbData->getRuleFunctions(RULES::MAX_FLIGHT_DUTY_PERIOD_QQ);
			if (rule6007.size()){
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxFlightDutyPeriod_QQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6007[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6007[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max FDP per duty rule.\n", (*ix)->crewIndex);
				
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6007 << endl;
					return false;
				}
			}*/

            auto& rule3107 = this->_dbData->getRuleFunctions(RULES::REMIND_MAX_FDP_PERDUTY);
			if (rule3107.size()){
				dbgRuleId = RULES::REMIND_MAX_FDP_PERDUTY;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkFDPPerDuty_Roster_remind(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule3107[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule3107[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max FDP per duty rule.\n", (*ix)->crewIndex);
			}

			auto& rule3108 = this->_dbData->getRuleFunctions(RULES::REMIND_MAX_BLOCK_PERDUTY);
			if (rule3108.size()){
				dbgRuleId = RULES::REMIND_MAX_BLOCK_PERDUTY;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkBlockPerDuty_Roster_remind(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule3108[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule3108[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max FDP per duty rule.\n", (*ix)->crewIndex);
			}

			auto& rule2112 = this->_dbData->getRuleFunctions(RULES::BUNK_SETTING);
			if (rule2112.size()) {
				dbgRuleId = RULES::BUNK_SETTING;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkFleetCombination(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule2112[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule2112[0].idRule, 1);
				if (_debug)
					printf("crew %d :check fleet combination rule.\n", (*ix)->crewIndex);
			}

			//根据8120隔离规则设置，初始化和重算Manday数据
			auto& rule8120 = this->_dbData->getRuleFunctions(RULES::CA_QUARANTINE_DEFINITION);
			if (rule8120.size()) {
				dbgRuleId = RULES::CA_QUARANTINE_DEFINITION;
				lapsed = clock();
				setQuarantineByDefinition(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule8120[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule8120[0].idRule, 1);
				if (_debug)
					printf("crew %d : reset crew manday for quarantine check.\n", (*ix)->crewIndex);
			}
			
			//6120
			auto& rule6120 = this->_dbData->getRuleFunctions(RULES::CHECK_OFF_DUTY_PERIOD_FOR_QQ);
			if (rule6120.size()) {
				dbgRuleId = RULES::CHECK_OFF_DUTY_PERIOD_FOR_QQ;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkOffDutyPeriodForQQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6120[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6120[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min rest For QQ.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6120 << endl;
					return false;
				}
			}

			//6121
			auto& rule6121 = this->_dbData->getRuleFunctions(RULES::CHECK_ASSIGNMENT_OVERLAPPABLE);
			if (rule6121.size()) {
				dbgRuleId = RULES::CHECK_OFF_DUTY_PERIOD_FOR_QQ;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkAssignmentOverlap(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6121[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6121[0].idRule, 1);
				if (_debug)
					printf("crew %d :check assignment overlappable.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6121 << endl;
					return false;
				}
			}

			//6010
			auto& rule6010 = this->_dbData->getRuleFunctions(RULES::LIMIT_BEFORE_ANNUAL_LEAVE);
			if (rule6010.size()) {
				dbgRuleId = RULES::LIMIT_BEFORE_ANNUAL_LEAVE;
				lapsed = clock();
				if ((isValid) && (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkLimitBeforeAnnualLeave_QQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6010[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6010[0].idRule, 1);
				if (_debug)
					printf("crew %d :check annual leave duty rule.\n", (*ix)->crewIndex);			
				
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6010 << endl;
					return false;
				}
			}

			//6011
			auto& rule6011 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST_BETWEEN_CONSECUTIVE_DAYS);
			if (rule6011.size()) {
				dbgRuleId = RULES::CHECK_MIN_REST_BETWEEN_CONSECUTIVE_DAYS;
				lapsed = clock();
				if (isValid)
					isValid = checkMinRestBetweenConsecutiveDays(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6011[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6011[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min rest between consecutive days rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6011 << endl;
					return false;
				}
			}

			//6020
			auto& rule6020 = this->_dbData->getRuleFunctions(RULES::MAX_FLIGHT_DUTY_BY_SPLIT_DUTY);
			if (rule6020.size()) {
				dbgRuleId = RULES::MAX_FLIGHT_DUTY_BY_SPLIT_DUTY;
				lapsed = clock();
				if ((isValid) && (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxFlightDutyBySplitDuty_QQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6020[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6020[0].idRule, 1);
				if (_debug)
					printf("crew %d :check annual leave duty rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6020 << endl;
					return false;
				}
			}

			//6103
			auto& rule6103 = this->_dbData->getRuleFunctions(RULES::ODP_CUMULATIVE_IN_7DAYS);
			if (rule6103.size()) {
				dbgRuleId = RULES::ODP_CUMULATIVE_IN_7DAYS;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkOffDutyPeriodsForCumulativeIn7Days_QQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6103[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6103[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Off Duty Periods for Cumulative Fatigue Recovery（7Days）.\n", (*ix)->crewIndex);
				
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6103 << endl;
					return false;
				}
			}

			//6110
			auto& rule6110 = this->_dbData->getRuleFunctions(RULES::MIN_ODP_IN_PERIOD_FOR_CC);
			if (rule6110.size()) {
				dbgRuleId = RULES::MIN_ODP_IN_PERIOD_FOR_CC;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinODPInPeriodForCc_QQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6110[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6110[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max FDP per duty rule.\n", (*ix)->crewIndex);
				
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6110 << endl;
					return false;
				}
			}

			//6025
			auto& rule6025 = this->_dbData->getRuleFunctions(RULES::LIMIT_MAX_DP_QQ);
			if (rule6025.size()) {
				dbgRuleId = RULES::LIMIT_MAX_DP_QQ;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxDP_QQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6025[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6025[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max DP rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6025 << endl;
					return false;
				}
			}

			//6026
			auto& rule6026 = this->_dbData->getRuleFunctions(RULES::LIMIT_FLEET_FOR_STANDBY_QQ);
			if (rule6026.size()) {
				dbgRuleId = RULES::LIMIT_FLEET_FOR_STANDBY_QQ;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkFleetForStandby_QQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6026[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6026[0].idRule, 1);
				if (_debug)
					printf("crew %d :check segment fleet qual for standby rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6026 << endl;
					return false;
				}
			}

			//6038
			auto& rule6038 = this->_dbData->getRuleFunctions(RULES::CHECK_ADAPTION_PERIOD_4_MAX_CONSECUTIVE_FDP);
			if (rule6038.size()) {
				dbgRuleId = RULES::CHECK_ADAPTION_PERIOD_4_MAX_CONSECUTIVE_FDP;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkAdaptionPeriod4MaxConsecutiveDuty(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6038[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6038[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max DP rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6038 << endl;
					return false;
				}
			}

			//6039
			auto& rule6039 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_NUM_CREW_RANK);
			if (rule6039.size()) {
				dbgRuleId = RULES::CHECK_MIN_NUM_CREW_RANK;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinNumOfCrewRank(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6039[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6039[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min number of crew rank rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6039 << endl;
					return false;
				}
			}

			//6041
			auto& rule6041 = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_NUMBER_OF_DP_IN_RP_FOR_QQ);
			if (rule6041.size()) {
				dbgRuleId = RULES::CHECK_MAX_NUMBER_OF_DP_IN_RP_FOR_QQ;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxNumberOfDPInRPForQQ(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6041[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6041[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max number of dp in rp for QQ.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6041 << endl;
					return false;
				}
			}

			//7007
			auto& rule7007 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST);
			if (rule7007.size()) {
				dbgRuleId = RULES::CHECK_MIN_REST;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckMinRestInRangeRule(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7007[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7007[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min rest in range rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7007 << endl;
					return false;
				}
			}

			//7009
			auto& rule7009 = this->_dbData->getRuleFunctions(RULES::CHECK_SINGLE_DUTY_PER_DAY);
			if (rule7009.size()) {
				dbgRuleId = RULES::CHECK_SINGLE_DUTY_PER_DAY;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckSingleDutyPerDay(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7009[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7009[0].idRule, 1);
				if (_debug)
					printf("crew %d :check single duty per day rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7009 << endl;
					return false;
				}
			}

			//7011
			auto& rule7011 = this->_dbData->getRuleFunctions(RULES::CHECK_CREW_COUNTRY_LIMITATION);
			if (rule7011.size()) {
				dbgRuleId = RULES::CHECK_CREW_COUNTRY_LIMITATION;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CrewCountryLimitation(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7011[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7011[0].idRule, 1);
				if (_debug)
					printf("crew %d :check crew country limitation rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7011 << endl;
					return false;
				}
			}

			//7013
			auto& rule7013 = this->_dbData->getRuleFunctions(RULES::CHECK_COF_MULTIPLE_QUALS_TG);
			if (rule7013.size()) {
				dbgRuleId = RULES::CHECK_COF_MULTIPLE_QUALS_TG;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckCOFMultipleQualsTG(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7013[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7013[0].idRule, 1);
				if (_debug)
					printf("crew %d :check COF multiple quals rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7013 << endl;
					return false;
				}
			}

			//7014
			auto& rule7014 = this->_dbData->getRuleFunctions(RULES::CHECK_RECURRENT_EXTENDED_RECOVERY_REST_PERIOD);
			if (rule7014.size()) {
				dbgRuleId = RULES::CHECK_RECURRENT_EXTENDED_RECOVERY_REST_PERIOD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = RecurrentExtendedRecoveryRestPeriod(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7014[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7014[0].idRule, 1);
				if (_debug)
					printf("crew %d :check RERRP rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7014 << endl;
					return false;
				}
			}

			//7015
			auto& rule7015 = this->_dbData->getRuleFunctions(RULES::CHECK_REST_FOR_LATE_ARRIVAL_OR_EARLY_START);
			if (rule7015.size()) {
				dbgRuleId = RULES::CHECK_REST_FOR_LATE_ARRIVAL_OR_EARLY_START;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckRestForLateArrivalOrEarlyStartRule_TG(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7015[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7015[0].idRule, 1);
				if (_debug)
					printf("crew %d :check RERRP rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7015 << endl;
					return false;
				}
			}

			//7016
			auto& rule7016 = this->_dbData->getRuleFunctions(RULES::CHECK_CREW_OPERATING_RECENCY);
			if (rule7016.size()) {
				dbgRuleId = RULES::CHECK_CREW_OPERATING_RECENCY;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckCrewOperatingRecencyRule_TG(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7016[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7016[0].idRule, 1);
				if (_debug)
					printf("crew %d :check RERRP rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7016 << endl;
					return false;
				}
			}

			//7019
			auto& rule7019 = this->_dbData->getRuleFunctions(RULES::LIMIT_ACTUAL_FDP_ON_STANDBY_OF_CC_TG);
			if (rule7019.size()) {
				dbgRuleId = RULES::LIMIT_ACTUAL_FDP_ON_STANDBY_OF_CC_TG;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkActualFdpOnStandbyOfCc_TG(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7019[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7019[0].idRule, 1);
				if (_debug)
					printf("crew %d :check actual fdp on standby rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7019 << endl;
					return false;
				}
			}

			//7022
			auto& rule7022 = this->_dbData->getRuleFunctions(RULES::REDUCE_REST_FOR_TG);
			if (rule7022.size()) {
				dbgRuleId = RULES::REDUCE_REST_FOR_TG;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinRestReduceBetweenDO(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7022[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7022[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max reduce rest times rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7022 << endl;
					return false;
				}
			}

			////7024
			//auto& rule7024 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST_AT_BASE_FOR_TG);
			//if (rule7024.size()) {
			//	dbgRuleId = RULES::CHECK_MIN_REST_AT_BASE_FOR_TG;
			//	lapsed = clock();
			//	if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
			//		isValid = checkMinRestAtBaseForTG(*ix);
			//	lpased2 = clock();
			//	RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7024[0].idRule, (lpased2 - lapsed));
			//	RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7024[0].idRule, 1);
			//	if (_debug)
			//		printf("crew %d :check min rest at base For TG.\n", (*ix)->crewIndex);

			//	if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
			//		cout << 7214 << endl;
			//		return false;
			//	}
			//}

			//7008
			auto& rule7008 = this->_dbData->getRuleFunctions(RULES::CHECK_CONSECUTIVE_DUTY);
			if (rule7008.size()) {
				dbgRuleId = RULES::CHECK_CONSECUTIVE_DUTY;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckConsecutiveDuty(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7008[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7008[0].idRule, 1);
				if (_debug)
					printf("crew %d :check consecutive duty rule.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7008 << endl;
					return false;
				}
			}

			//7200
			auto& rule7200 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST_FOR_EVA_FD);
			if (rule7200.size()) {
				dbgRuleId = RULES::CHECK_MIN_REST_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinRestForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7200[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7200[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min rest For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7200 << endl;
					return false;
				}
			}

			//7265
			auto& rule7265 = this->_dbData->getRuleFunctions(RULES::CHECK_SCH_MIN_REST_FOR_EVA_FD);
			if (rule7265.size()) {
				dbgRuleId = RULES::CHECK_SCH_MIN_REST_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSchMinRestForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7265[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7265[0].idRule, 1);
				if (_debug)
					printf("crew %d :check schedule min rest For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7265 << endl;
					return false;
				}
			}

			//7266
			auto& rule7266 = this->_dbData->getRuleFunctions(RULES::CHECK_SCH_MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD);
			if (rule7266.size()) {
				dbgRuleId = RULES::CHECK_SCH_MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSchMinRestAfterCumulativeFT_EvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7266[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7266[0].idRule, 1);
				if (_debug)
					printf("crew %d :check schedule min rest in consecutive hours For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7266 << endl;
					return false;
				}
			}

			//7115
			auto& rule7115 = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_CONSECUTIVE_DAY_FOR_IT);
			if (rule7115.size()) {
				dbgRuleId = RULES::CHECK_MAX_CONSECUTIVE_DAY_FOR_IT;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxConsecutiveDayForIt(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7115[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7115[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Max Consecutive Day For IT.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7115 << endl;
					return false;
				}
			}

			//7202
			auto& rule7202 = this->_dbData->getRuleFunctions(RULES::CUMULATIVE_BLH_LIMIT_FOR_EVA_FD);
			if (rule7202.size()) {
				dbgRuleId = RULES::CUMULATIVE_BLH_LIMIT_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCumulativeFtLimitForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7202[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7202[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Cumulative FT Limit For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7202 << endl;
					return false;
				}
			}

			//7203
			auto& rule7203 = this->_dbData->getRuleFunctions(RULES::CHECK_SEG_RESTRICT_FOR_EVA_FD);
			if (rule7203.size()) {
				dbgRuleId = RULES::CHECK_SEG_RESTRICT_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSegmentRestrictionForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7203[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7203[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Segment Restriction For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7203 << endl;
					return false;
				}
			}

			//7204
			auto& rule7204 = this->_dbData->getRuleFunctions(RULES::CHECK_SEG_RESTRICT_WOCL_FOR_EVA_FD);
			if (rule7204.size()) {
				dbgRuleId = RULES::CHECK_SEG_RESTRICT_WOCL_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSegmentRestrictionWOCLForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7204[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7204[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Segment Restriction WOCL For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7204 << endl;
					return false;
				}
			}

			//7205
			auto& rule7205 = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_BLH_IN_PERIOD_FOR_EVA_FD);
			if (rule7205.size()) {
				dbgRuleId = RULES::CHECK_MAX_BLH_IN_PERIOD_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxBLHInPeriodForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7205[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7205[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Max FT in Period For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7205 << endl;
					return false;
				}
			}

			//7210
			auto& rule7210 = this->_dbData->getRuleFunctions(RULES::CHECK_CONSECUTIVE_WOCL_FOR_EVA);
			if (rule7210.size()) {
				dbgRuleId = RULES::CHECK_CONSECUTIVE_WOCL_FOR_EVA;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkConsecutiveWOCLRestForEva(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7210[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7210[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Consecutive WOCL For EVA.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7210 << endl;
					return false;
				}
			}

			//7268
			auto& rule7268 = this->_dbData->getRuleFunctions(RULES::CHECK_SCH_CONSECUTIVE_WOCL_FOR_EVA);
			if (rule7268.size()) {
				dbgRuleId = RULES::CHECK_SCH_CONSECUTIVE_WOCL_FOR_EVA;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSchConsecutiveWOCLRestForEva(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7268[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7268[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Schedule Consecutive WOCL For EVA.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7268 << endl;
					return false;
				}
			}


			//7212
			auto& rule7212 = this->_dbData->getRuleFunctions(RULES::MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD);
			if (rule7212.size()) {
				dbgRuleId = RULES::MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinWOCLAtLayoverStationForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7212[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7212[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Min WOCL At Layover station For EVA.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7212 << endl;
					return false;
				}
			}

			//7267
			auto& rule7267 = this->_dbData->getRuleFunctions(RULES::SCH_MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD);
			if (rule7267.size()) {
				dbgRuleId = RULES::SCH_MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSchMinWOCLAtLayoverStationForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7267[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7267[0].idRule, 1);
				if (_debug)
					printf("crew %d :check Schedule Min WOCL At Layover station For EVA.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7267 << endl;
					return false;
				}
			}

			//7213
			auto& rule7213 = this->_dbData->getRuleFunctions(RULES::CHECK_NIGHT_REST_PERIOD_FOR_EVA_FD);
			if (rule7213.size()) {
				dbgRuleId = RULES::CHECK_NIGHT_REST_PERIOD_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckNightRestPeriodForEva(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7213[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7213[0].idRule, 1);
				if (_debug)
					printf("crew %d :check night rest period For EVA.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7213 << endl;
					return false;
				}
			}

			//7214
			auto& rule7214 = this->_dbData->getRuleFunctions(RULES::LAYOVER_REST_LIMIT_BY_TIME_ZONE_FOR_EVA_FD);
			if (rule7214.size()) {
				dbgRuleId = RULES::LAYOVER_REST_LIMIT_BY_TIME_ZONE_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkLayoverRestLimitByTimeZoneForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7214[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7214[0].idRule, 1);
				if (_debug)
					printf("crew %d :check layover rest limitation by time zone For EVA.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7214 << endl;
					return false;
				}
			}

			auto& rule7221 = this->_dbData->getRuleFunctions(RULES::DISALLOW_IMPLAUSIBLE_CONNECTIONS);
			if (rule7221.size()) {
				dbgRuleId = RULES::DISALLOW_IMPLAUSIBLE_CONNECTIONS;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckImplausibleConnectionsForCrew(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7221[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7221[0].idRule, 1);
				if (_debug)
					printf("crew %d :check implausible connections.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7221 << endl;
					return false;
				}
			}

			//7220
			auto& rule7220 = this->_dbData->getRuleFunctions(RULES::NUM_OF_CREW_ON_FLIGHT_FOR_EVA_FD);
			if (rule7220.size()) {
				dbgRuleId = RULES::NUM_OF_CREW_ON_FLIGHT_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkNumberOfCrewOnFlightForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7220[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7220[0].idRule, 1);
				if (_debug)
					printf("crew %d :check number of crew on flight for EVA.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7220 << endl;
					return false;
				}
			}

			//7223
			auto& rule7223 = this->_dbData->getRuleFunctions(RULES::MAX_LAYOVER_IN_MONTH);
			if (rule7223.size()) {
				dbgRuleId = RULES::MAX_LAYOVER_IN_MONTH;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckMaxLayoversInTripsForMonth(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7223[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7223[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max layover in month.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7223 << endl;
					return false;
				}
			}
			
			//7225
			auto& rule7225 = this->_dbData->getRuleFunctions(RULES::CHECK_TRAINING_ROSTER_FOR_EVA_FD);
			if (rule7225.size()) {
				dbgRuleId = RULES::CHECK_TRAINING_ROSTER_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkTrainingRosterForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7225[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7225[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training roster For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7225 << endl;
					return false;
				}
			}

			//7226
			auto& rule7226 = this->_dbData->getRuleFunctions(RULES::CHECK_TRAINING_END_FOR_EVA_FD);
			if (rule7226.size()) {
				dbgRuleId = RULES::CHECK_TRAINING_END_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkTrainingEndForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7226[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7226[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training end For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7226 << endl;
					return false;
				}
			}

			//7227
			auto& rule7227 = this->_dbData->getRuleFunctions(RULES::CHECK_LAYOVER_RESTRICTION);
			if (rule7227.size()) {
				dbgRuleId = RULES::CHECK_LAYOVER_RESTRICTION;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkLayoverRestriction(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7227[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7227[0].idRule, 1);
				if (_debug)
					printf("crew %d :layover restriction For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7227 << endl;
					return false;
				}
			}

			//7228
			auto& rule7228 = this->_dbData->getRuleFunctions(RULES::TRAINING_BRIEF_AND_DEBRIEF);
			if (rule7228.size()) {
				dbgRuleId = RULES::TRAINING_BRIEF_AND_DEBRIEF;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkTrainingBriefAndDebrief(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7228[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7228[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training brief and debrief For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7228 << endl;
					return false;
				}
			}

			//7229
			auto& rule7229 = this->_dbData->getRuleFunctions(RULES::CHECK_PASSPORT_AND_VISA_FOR_EVA_FD);
			if (rule7229.size()) {
				dbgRuleId = RULES::CHECK_PASSPORT_AND_VISA_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkPassportAndVisaForEva(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7229[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7229[0].idRule, 1);
				if (_debug)
					printf("crew %d :check passport and visa For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7229 << endl;
					return false;
				}
			}

			//7230
			auto& rule7230 = this->_dbData->getRuleFunctions(RULES::LIMIT_PROGRAM_COURSE_ROLE);
			if (rule7230.size()) {
				dbgRuleId = RULES::LIMIT_PROGRAM_COURSE_ROLE;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkTrainingProgramCourseRoleForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7230[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7230[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training program course role For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7230 << endl;
					return false;
				}
			}

			//7231
			auto& rule7231 = this->_dbData->getRuleFunctions(RULES::CHECK_RENEW_CERT_IN_ADVANCE);
			if (rule7231.size()) {
				dbgRuleId = RULES::CHECK_RENEW_CERT_IN_ADVANCE;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkRenewCertInAdvanceForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7231[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7231[0].idRule, 1);
				if (_debug)
					printf("crew %d :check renew certificate For Eva Fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7231 << endl;
					return false;
				}
			}

			//7232
			auto& rule7232 = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_CONSECUTIVE_ROSTER_FOR_IT);
			if (rule7232.size()) {
				dbgRuleId = RULES::CHECK_MAX_CONSECUTIVE_ROSTER_FOR_IT;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = CheckConsecutiveRosterForIt(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7232[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7232[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max consecutive roster for it.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7232 << endl;
					return false;
				}
			}

			//7233
			auto& rule7233 = this->_dbData->getRuleFunctions(RULES::LIMIT_COURSE_TIME_PERIOD_FOR_EVA_FD);
			if (rule7233.size()) {
				dbgRuleId = RULES::LIMIT_COURSE_TIME_PERIOD_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseTimePeriodForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7233[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7233[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course time period for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7233 << endl;
					return false;
				}
			}

			//7234
			auto& rule7234 = this->_dbData->getRuleFunctions(RULES::LIMIT_COURSE_ROLE_QUAL_FOR_EVA_FD);
			if (rule7234.size()) {
				dbgRuleId = RULES::LIMIT_COURSE_ROLE_QUAL_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseRoleQualForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7234[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7234[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course role qualification for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7234 << endl;
					return false;
				}
			}

			//7235
			auto& rule7235 = this->_dbData->getRuleFunctions(RULES::LIMIT_COURSE_ROLE_NUMBERS_FOR_EVA_FD);
			if (rule7235.size()) {
				dbgRuleId = RULES::LIMIT_COURSE_ROLE_NUMBERS_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseRoleNumbersForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7235[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7235[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course role numbers for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7235 << endl;
					return false;
				}
			}

			//7236
			auto& rule7236 = this->_dbData->getRuleFunctions(RULES::LIMIT_DAYS_BETWEEN_COURSES_FOR_EVA_FD);
			if (rule7236.size()) {
				dbgRuleId = RULES::LIMIT_DAYS_BETWEEN_COURSES_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkDaysBetweenCoursesForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7236[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7236[0].idRule, 1);
				if (_debug)
					printf("crew %d :check the number of days between training courses for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7236 << endl;
					return false;
				}
			}

			//7237
			auto& rule7237 = this->_dbData->getRuleFunctions(RULES::LIMIT_DEPEND_BETWEEN_COURSES_FOR_EVA_FD);
			if (rule7237.size()) {
				dbgRuleId = RULES::LIMIT_DEPEND_BETWEEN_COURSES_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkDependBetweenCoursesForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7237[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7237[0].idRule, 1);
				if (_debug)
					printf("crew %d :check dependency between training courses for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7237 << endl;
					return false;
				}
			}

			//7238
			auto& rule7238 = this->_dbData->getRuleFunctions(RULES::LIMIT_COURSE_START_TIME_FOR_EVA_FD);
			if (rule7238.size()) {
				dbgRuleId = RULES::LIMIT_COURSE_START_TIME_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseStartTimeForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7238[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7238[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course start time for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7238 << endl;
					return false;
				}
			}

			//7239
			auto& rule7239 = this->_dbData->getRuleFunctions(RULES::LIMIT_COURSE_DEVICE_TYPE_FOR_EVA_FD);
			if (rule7239.size()) {
				dbgRuleId = RULES::LIMIT_COURSE_DEVICE_TYPE_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseDeviceTypeForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7239[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7239[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course device for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7239 << endl;
					return false;
				}
			}

			//7240
			auto& rule7240 = this->_dbData->getRuleFunctions(RULES::CHECK_COURSE_DEVICE_AVAIL_FOR_EVA_FD);
			if (rule7240.size()) {
				dbgRuleId = RULES::CHECK_COURSE_DEVICE_AVAIL_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseDeviceAvailForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7240[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7240[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course device Avail for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7240 << endl;
					return false;
				}
			}

			//7241
			auto& rule7241 = this->_dbData->getRuleFunctions(RULES::LIMIT_COURSE_PIP_NUMBERS_FOR_EVA_FD);
			if (rule7241.size()) {
				dbgRuleId = RULES::LIMIT_COURSE_PIP_NUMBERS_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCoursePipNumbersForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7241[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7241[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course pip numbers for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7241 << endl;
					return false;
				}
			}

			//7242
			auto& rule7242 = this->_dbData->getRuleFunctions(RULES::LIMIT_COURSE_DURATION_FOR_EVA_FD);
			if (rule7242.size()) {
				dbgRuleId = RULES::LIMIT_COURSE_DURATION_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseDurationForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7242[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7242[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course duration for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7242 << endl;
					return false;
				}
			}

			//7243
			auto& rule7243 = this->_dbData->getRuleFunctions(RULES::LIMIT_SAME_ROLE_INSTRUCTOR_FOR_EVA_FD);
			if (rule7243.size()) {
				dbgRuleId = RULES::LIMIT_SAME_ROLE_INSTRUCTOR_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSameRoleInstructorForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7243[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7243[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course same instructor for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7243 << endl;
					return false;
				}
			}

			//7244
			auto& rule7244 = this->_dbData->getRuleFunctions(RULES::LIMIT_PROGRAM_COURSE_ON_FLIGHT_FOR_EVA_FD);
			if (rule7244.size()) {
				dbgRuleId = RULES::LIMIT_PROGRAM_COURSE_ON_FLIGHT_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkProgramCourseOnFlightForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7244[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7244[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course on flight for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7244 << endl;
					return false;
				}
			}

			//7245
			auto& rule7245 = this->_dbData->getRuleFunctions(RULES::LIMIT_TRAINING_ROLE_IN_TEAM_FOR_EVA_FD);
			if (rule7245.size()) {
				dbgRuleId = RULES::LIMIT_TRAINING_ROLE_IN_TEAM_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkTrainingRoleInTeamForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7245[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7245[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training role in team for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7245 << endl;
					return false;
				}
			}

			//7246
			auto& rule7246 = this->_dbData->getRuleFunctions(RULES::LIMIT_SAME_DEVICE_IN_PROGRAM_FOR_EVA_FD);
			if (rule7246.size()) {
				dbgRuleId = RULES::LIMIT_SAME_DEVICE_IN_PROGRAM_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSameDeviceInProgramForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7246[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7246[0].idRule, 1);
				if (_debug)
					printf("crew %d :check the same device in program for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7246 << endl;
					return false;
				}
			}

			//7247
			auto& rule7247 = this->_dbData->getRuleFunctions(RULES::RESTRICT_INSTRUCTOR_HOLD_ROLE_FOR_EVA_FD);
			if (rule7247.size()) {
				dbgRuleId = RULES::RESTRICT_INSTRUCTOR_HOLD_ROLE_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkInstructorHoldRoleForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7247[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7247[0].idRule, 1);
				if (_debug)
					printf("crew %d :check instructor hold role for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7247 << endl;
					return false;
				}
			}

			//7248
			auto& rule7248 = this->_dbData->getRuleFunctions(RULES::RESTRICT_TRAINEE_HOLD_ROLE_FOR_EVA_FD);
			if (rule7248.size()) {
				dbgRuleId = RULES::RESTRICT_TRAINEE_HOLD_ROLE_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkTraineeHoldAssignmentForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7248[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7248[0].idRule, 1);
				if (_debug)
					printf("crew %d :check trainee hold assignment for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7248 << endl;
					return false;
				}
			}

			//7249
			auto& rule7249 = this->_dbData->getRuleFunctions(RULES::REQUIRED_MIN_NUM_OF_COURSE_FOR_EVA_FD);
			if (rule7249.size()) {
				dbgRuleId = RULES::REQUIRED_MIN_NUM_OF_COURSE_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkRequiredMinNumOfCourseForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7249[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7249[0].idRule, 1);
				if (_debug)
					printf("crew %d :check required min number of course for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7249 << endl;
					return false;
				}
			}

			//7250
			auto& rule7250 = this->_dbData->getRuleFunctions(RULES::CHECK_UNASSIGNED_COURSE_FOR_EVA_FD);
			if (rule7250.size()) {
				dbgRuleId = RULES::CHECK_UNASSIGNED_COURSE_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkUnassignedCourseForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7250[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7250[0].idRule, 1);
				if (_debug)
					printf("crew %d :check unassigned program course for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7250 << endl;
					return false;
				}
			}

			//7251
			auto& rule7251 = this->_dbData->getRuleFunctions(RULES::LIMIT_COURSE_ROLE_QUAL_NUMBERS_FOR_EVA_FD);
			if (rule7251.size()) {
				dbgRuleId = RULES::LIMIT_COURSE_ROLE_QUAL_NUMBERS_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseRoleQualAndNumbersForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7251[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7251[0].idRule, 1);
				if (_debug)
					printf("crew %d :limit program course role qual and numbers for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7251 << endl;
					return false;
				}
			}

			//7252
			auto& rule7252 = this->_dbData->getRuleFunctions(RULES::CHECK_FAILED_COURSE_FOR_EVA_FD);
			if (rule7252.size()) {
				dbgRuleId = RULES::CHECK_FAILED_COURSE_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkFailedCourseForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7252[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7252[0].idRule, 1);
				if (_debug)
					printf("crew %d :check failed program course for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7252 << endl;
					return false;
				}
			}

			//7253
			auto& rule7253 = this->_dbData->getRuleFunctions(RULES::LIMIT_LEG_AND_STATION_FOR_EVA_FD);
			if (rule7253.size()) {
				dbgRuleId = RULES::LIMIT_LEG_AND_STATION_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkLegAndStationForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7253[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7253[0].idRule, 1);
				if (_debug)
					printf("crew %d :limit leg and station on line course for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7253 << endl;
					return false;
				}
			}

			//7254
			auto& rule7254 = this->_dbData->getRuleFunctions(RULES::BUDDIES_IN_SAME_COURSE_FOR_EVA_FD);
			if (rule7254.size()) {
				dbgRuleId = RULES::BUDDIES_IN_SAME_COURSE_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkBuddiesInSameCourseForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7254[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7254[0].idRule, 1);
				if (_debug)
					printf("crew %d :check buddies in same course for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7254 << endl;
					return false;
				}
			}

			//7255
			auto& rule7255 = this->_dbData->getRuleFunctions(RULES::ONLY_SAME_COURSE_CODE_IN_DUTY_FOR_EVA_FD);
			if (rule7255.size()) {
				dbgRuleId = RULES::ONLY_SAME_COURSE_CODE_IN_DUTY_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkOnlySameCourseCodeInDutyForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7255[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7255[0].idRule, 1);
				if (_debug)
					printf("crew %d :only same course in duty for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7255 << endl;
					return false;
				}
			}

			//7256
			auto& rule7256 = this->_dbData->getRuleFunctions(RULES::LIMIT_MAX_GAP_DAYS_BETWEEN_COURSES_FOR_EVA_FD);
			if (rule7256.size()) {
				dbgRuleId = RULES::LIMIT_MAX_GAP_DAYS_BETWEEN_COURSES_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxGapDaysBetweenCoursesForEvaFdRule(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7256[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7256[0].idRule, 1);
				if (_debug)
					printf("crew %d :limit max gap days between courses for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7256 << endl;
					return false;
				}
			}

			//7257
			auto& rule7257 = this->_dbData->getRuleFunctions(RULES::LIMIT_NUMBER_OF_TRAINEES_FOR_COURSES_ON_SAME_DAY_FOR_EVA_FD);
			if (rule7257.size()) {
				dbgRuleId = RULES::LIMIT_NUMBER_OF_TRAINEES_FOR_COURSES_ON_SAME_DAY_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkNumberOfTraineeForCoursesOnSameDayForEvaFdRule(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7257[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7257[0].idRule, 1);
				if (_debug)
					printf("crew %d :limit number of trainees for courses on same day.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7257 << endl;
					return false;
				}
			}

			//7258
			auto& rule7258 = this->_dbData->getRuleFunctions(RULES::LIMIT_SAME_ROLE_INSTRUCTOR_ON_EXTRA_COURSE_FOR_EVA_FD);
			if (rule7258.size()) {
				dbgRuleId = RULES::LIMIT_SAME_ROLE_INSTRUCTOR_ON_EXTRA_COURSE_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSameRoleInstructorOnExtraCourseForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7258[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7258[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course same instructor on extra course for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7258 << endl;
					return false;
				}
			}

			//7259
			auto& rule7259 = this->_dbData->getRuleFunctions(RULES::CHECK_COURSE_ONLY_ASSIGNED_TO_INSTRUCTOR);
			if (rule7259.size()) {
				dbgRuleId = RULES::CHECK_COURSE_ONLY_ASSIGNED_TO_INSTRUCTOR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseOnlyAssignInstructorForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7259[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7259[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training course only assigned to instructor for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7259 << endl;
					return false;
				}
			}

			//7261
			auto& rule7261 = this->_dbData->getRuleFunctions(RULES::CHECK_ACCLIMATIZED_REST_FOR_EVA);
			if (rule7261.size()) {
				dbgRuleId = RULES::CHECK_ACCLIMATIZED_REST_FOR_EVA;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkAcclimatizedRestForEva(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7261[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7261[0].idRule, 1);
				if (_debug)
					printf("crew %d :check acclimatized rest for eva fd.\n", (*ix)->crewIndex);
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7261 << endl;
					return false;
				}
			}

			//7271
			auto& rule7271 = this->_dbData->getRuleFunctions(RULES::CHECK_SCH_ACCLIMATIZED_REST_FOR_EVA);
			if (rule7271.size()) {
				dbgRuleId = RULES::CHECK_SCH_ACCLIMATIZED_REST_FOR_EVA;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSchAcclimatizedRestForEva(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7271[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7271[0].idRule, 1);
				if (_debug)
					printf("crew %d :check schedule acclimatized rest for eva fd.\n", (*ix)->crewIndex);
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7271 << endl;
					return false;
				}
			}

			//7262
			auto& rule7262 = this->_dbData->getRuleFunctions(RULES::LIMIT_INEXP_CREW_FOR_EVA_FD);
			if (rule7262.size()) {
				dbgRuleId = RULES::LIMIT_INEXP_CREW_FOR_EVA_FD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkInexperiencedCrewForEvaFd(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7262[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7262[0].idRule, 1);
				if (_debug)
					printf("crew %d :limit inexperienced crew for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7262 << endl;
					return false;
				}
			}

			//7263
			auto& rule7263 = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_EARLY_START_OR_LATE_FINISH);
			if (rule7263.size()) {
				dbgRuleId = RULES::CHECK_MAX_EARLY_START_OR_LATE_FINISH;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxEarlyStartOrLateFinishWithinPeriod(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7263[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7263[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max early start/late finish flight.\n", (*ix)->crewIndex);
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7263 << endl;
					return false;
				}
			}

			//7273
			auto& rule7273 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_CONNECT_IN_DUTY);
			if (rule7273.size()) {
				dbgRuleId = RULES::CHECK_MIN_CONNECT_IN_DUTY;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinConnectInDutyRuleForEva(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7273[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7273[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min connect in duty.\n", (*ix)->crewIndex);
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7273 << endl;
					return false;
				}
			}

			//7274
			auto& rule7274 = this->_dbData->getRuleFunctions(RULES::CHECK_IOE_PAHSE_FLIGHT_COMPOSITION);
			if (rule7274.size()) {
				dbgRuleId = RULES::CHECK_MIN_CONNECT_IN_DUTY;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkIOEPhaseFlightComposition(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7274[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7274[0].idRule, 1);
				if (_debug)
					printf("crew %d :check ioe pahse flight composition.\n", (*ix)->crewIndex);
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7274 << endl;
					return false;
				}
			}

			//7275
			auto& rule7275 = this->_dbData->getRuleFunctions(RULES::CHECk_DAYS_OFF_FOR_TRADE);
			if (rule7275.size()) {
				dbgRuleId = RULES::CHECk_DAYS_OFF_FOR_TRADE;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkDaysOffForTrade(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7275[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7275[0].idRule, 1);
				if (_debug)
					printf("crew %d :check days off for trade.\n", (*ix)->crewIndex);
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7275 << endl;
					return false;
				}
			}

			//7276
			auto& rule7276 = this->_dbData->getRuleFunctions(RULES::CHECK_DISRUPTIVE_SCHEDULES_LOCAL_NIGHT_FOR_TG);
			if (rule7276.size()) {
				dbgRuleId = RULES::CHECK_DISRUPTIVE_SCHEDULES_LOCAL_NIGHT_FOR_TG;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkDisruptiveSchedulesLocalNightForTG(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7276[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7276[0].idRule, 1);
				if (_debug)
					printf("crew %d :check disruptive schedule.\n", (*ix)->crewIndex);
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7276 << endl;
					return false;
				}
			}

			//7277
			auto& rule7277 = this->_dbData->getRuleFunctions(RULES::CHECK_DISRUPTIVE_SCHEDULES_RERRP_FOR_TG);
			if (rule7277.size()) {
				dbgRuleId = RULES::CHECK_DISRUPTIVE_SCHEDULES_RERRP_FOR_TG;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkDisruptiveSchedulesRERRPForTG(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7277[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7277[0].idRule, 1);
				if (_debug)
					printf("crew %d :check disruptive schedule.\n", (*ix)->crewIndex);
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7277 << endl;
					return false;
				}
			}
			
			//7279
			auto& rule7279 = this->_dbData->getRuleFunctions(RULES::CHECK_ULR_ON_TRAINING_FOR_EVAFD);
			if (rule7279.size()) {
				dbgRuleId = RULES::CHECK_ULR_ON_TRAINING_FOR_EVAFD;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkLimitULROnTrainingForEvaFD(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7279[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7279[0].idRule, 1);
				if (_debug)
					printf("crew %d :check limit ulr on training flight.\n", (*ix)->crewIndex);
				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7279 << endl;
					return false;
				}
			}

			//7305
			auto& rule7305 = this->_dbData->getRuleFunctions(RULES::LIMIT_MAX_CONSECUTIVE_DUTY_TIMES_FOR_PR);
			if (rule7305.size()) {
				dbgRuleId = RULES::LIMIT_MAX_CONSECUTIVE_DUTY_TIMES_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxConsecutiveDutyTimesForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7305[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7305[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max consecutive duty times for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7305 << endl;
					return false;
				}
			}

			//7306
			auto& rule7306 = this->_dbData->getRuleFunctions(RULES::LIMIT_MIN_REST_LFES_FLIGHT_FOR_PR);
			if (rule7306.size()) {
				dbgRuleId = RULES::LIMIT_MIN_REST_LFES_FLIGHT_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinRestAfterLFESFlightForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7306[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7306[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min rest after LFES Flight for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7306 << endl;
					return false;
				}
			}

			//7307
			auto& rule7307 = this->_dbData->getRuleFunctions(RULES::MIN_REST_BASED_LOCAL_NIGHT_FOR_PR);
			if (rule7307.size()) {
				dbgRuleId = RULES::MIN_REST_BASED_LOCAL_NIGHT_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinRestBasedLocalNightForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7307[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7307[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min rest based local night For PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7307 << endl;
					return false;
				}
			}

			//7308
			auto& rule7308 = this->_dbData->getRuleFunctions(RULES::CHECK_EARNED_DAYS_OFF_FOR_PR);
			if (rule7308.size()) {
				dbgRuleId = RULES::CHECK_EARNED_DAYS_OFF_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkEarnedDaysOffForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7308[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7308[0].idRule, 1);
				if (_debug)
					printf("crew %d :check earned days off for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7308 << endl;
					return false;
				}
			}

			//7309
			auto& rule7309 = this->_dbData->getRuleFunctions(RULES::LIMIT_MIN_REST_BETWEEN_ROSTERS_FOR_PR);
			if (rule7309.size()) {
				dbgRuleId = RULES::LIMIT_MIN_REST_BETWEEN_ROSTERS_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinRestBetweenRostersForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7309[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7309[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min rest bewteen rosters for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7309 << endl;
					return false;
				}
			}

			//7311
			auto& rule7311 = this->_dbData->getRuleFunctions(RULES::CALC_MIN_REST_BY_BLH_PR);
			if (rule7311.size()) {
				dbgRuleId = RULES::CALC_MIN_REST_BY_BLH_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinRestByBlockTime_PR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7311[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7311[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min rest by block time For PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7311 << endl;
					return false;
				}
			}

			//7312
			auto& rule7312 = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_FLIGHTS_IN_PEROID_PR);
			if (rule7312.size()) {
				dbgRuleId = RULES::LIMIT_MIN_REST_BETWEEN_ROSTERS_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxFlightsInPeriodForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7312[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7312[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max flights in period for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7312 << endl;
					return false;
				}
			}

			//7315
			auto& rule7315 = this->_dbData->getRuleFunctions(RULES::RESTICT_CREW_OR_FLIGHT_FOR_PR);
			if (rule7315.size()) {
				dbgRuleId = RULES::RESTICT_CREW_OR_FLIGHT_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCrewOrFlightForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7315[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7315[0].idRule, 1);
				if (_debug)
					printf("crew %d :check restict crew or flight for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7315 << endl;
					return false;
				}
			}

			//7314
			auto& rule7314 = this->_dbData->getRuleFunctions(RULES::CHECK_GENDER_ON_FLIGHT_BY_COMPOSITION_FOR_PR);
			if (rule7314.size()) {
				dbgRuleId = RULES::CHECK_GENDER_ON_FLIGHT_BY_COMPOSITION_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkGenderOnFlightByCompositionForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7314[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7314[0].idRule, 1);
				if (_debug)
					printf("crew %d :check gender on flight by composition for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7314 << endl;
					return false;
				}
			}

			//7320
			auto& rule7320 = this->_dbData->getRuleFunctions(RULES::CREW_ONLY_PERFORM_SPEC_TASK_FOR_PR);
			if (rule7320.size()) {
				dbgRuleId = RULES::CREW_ONLY_PERFORM_SPEC_TASK_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCrewOnlyPerformSpecificTaskForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7320[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7320[0].idRule, 1);
				if (_debug)
					printf("crew %d :check crew only perform specific task for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7320 << endl;
					return false;
				}
			}

			//7321
			auto& rule7321 = this->_dbData->getRuleFunctions(RULES::TASK_ONLY_OPERATED_FILTERED_CREW_FOR_PR);
			if (rule7321.size()) {
				dbgRuleId = RULES::TASK_ONLY_OPERATED_FILTERED_CREW_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkTaskOnlyBeOperatedByFilteredCrewForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7321[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7321[0].idRule, 1);
				if (_debug)
					printf("crew %d :check task only be operated by filter crew for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7321 << endl;
					return false;
				}
			}

			//7322
			auto& rule7322 = this->_dbData->getRuleFunctions(RULES::CREW_CANNOT_OPERATE_SPEC_TASK_FOR_PR);
			if (rule7322.size()) {
				dbgRuleId = RULES::CREW_CANNOT_OPERATE_SPEC_TASK_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCrewCannotOperateSpecificTaskForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7322[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7322[0].idRule, 1);
				if (_debug)
					printf("crew %d :check crew cannot operate specific task for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7322 << endl;
					return false;
				}
			}

			//7323
			auto& rule7323 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_PR);
			if (rule7323.size()) {
				dbgRuleId = RULES::CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinSpaceBetweenDutyForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7323[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7323[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min space between duty for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7323 << endl;
					return false;
				}
			}

			//7324
			auto& rule7324 = this->_dbData->getRuleFunctions(RULES::CHECK_BIRTHDAY_DAYS_OFF_FOR_PR);
			if (rule7324.size()) {
				dbgRuleId = RULES::CHECK_BIRTHDAY_DAYS_OFF_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkBirthdayDaysOffForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7324[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7324[0].idRule, 1);
				if (_debug)
					printf("crew %d :check birthday days off for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7324 << endl;
					return false;
				}
			}

			//7325
			auto& rule7325 = this->_dbData->getRuleFunctions(RULES::CHECK_DAYS_OFF_PATTERNS_FOR_PR);
			if (rule7325.size()) {
				dbgRuleId = RULES::CHECK_BIRTHDAY_DAYS_OFF_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinNumberOfDaysOffForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7325[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7325[0].idRule, 1);
				if (_debug)
					printf("crew %d :check days off patterns for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7325 << endl;
					return false;
				}
			}

			//7326
			auto& rule7326 = this->_dbData->getRuleFunctions(RULES::CHECK_EARLIES_BRIEF_OR_LATEST_DEBRIEF_AFTER_ROSTER_FOR_PR);
			if (rule7326.size()) {
				dbgRuleId = RULES::CHECK_EARLIES_BRIEF_OR_LATEST_DEBRIEF_AFTER_ROSTER_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkEarliesBriefOrLatestDebriefAfterRosterForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7326[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7326[0].idRule, 1);
				if (_debug)
					printf("crew %d :check earlies brief time before or latest debrief time after a roster with attribute for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7326 << endl;
					return false;
				}
			}

			//7327
			auto& rule7327 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_REST_AFTER_BASE_CHANGE_FOR_PR);
			if (rule7327.size()) {
				dbgRuleId = RULES::CHECK_MIN_REST_AFTER_BASE_CHANGE_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinRestAfterBaseChangeForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7327[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7327[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min rest after a base change for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7327 << endl;
					return false;
				}
			}

			//7356
			auto& rule7356 = this->_dbData->getRuleFunctions(RULES::LIMIT_ATTR_SPACING_BASED_MANDAY_FOR_PR);
			if (rule7356.size()) {
				dbgRuleId = RULES::LIMIT_ATTR_SPACING_BASED_MANDAY_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkAttributesSpacingBasedMandayForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7356[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7356[0].idRule, 1);
				if (_debug)
					printf("crew %d :check attributes spacing based on manday for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7356 << endl;
					return false;
				} 
			}

			//7357
			auto& rule7357 = this->_dbData->getRuleFunctions(RULES::LIMIT_MAX_ATTR_NUM_BASED_MANDAY_FOR_PR);
			if (rule7357.size()) {
				dbgRuleId = RULES::LIMIT_MAX_ATTR_NUM_BASED_MANDAY_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxAttributesNumberBasedMandayForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7357[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7357[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max attributes number based on manday for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7357 << endl;
					return false;
				}
			}

			//7358
			auto& rule7358 = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_FATIGUE_SCORE_FOR_5J);
			if (rule7358.size()) {
				dbgRuleId = RULES::CHECK_MAX_FATIGUE_SCORE_FOR_5J;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxFatigueScoreFor5J(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7358[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7358[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max fatigue score for 5j.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7358 << endl;
					return false;
				}
			}

			//7359
			auto& rule7359 = this->_dbData->getRuleFunctions(RULES::CHECL_STANDARD_FDP_EXTENSION_REST_REQUIREMENT_FOR_5J);
			if (rule7359.size()) {
				dbgRuleId = RULES::CHECL_STANDARD_FDP_EXTENSION_REST_REQUIREMENT_FOR_5J;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkStandardFdpExtensionRestRequirementFor5J(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7359[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7359[0].idRule, 1);
				if (_debug)
					printf("crew %d :check standard fdp extension rest requirement for 5j.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7359 << endl;
					return false;
				}
			}

			//7360
			auto& rule7360 = this->_dbData->getRuleFunctions(RULES::CHECK_AIRCRAFT_CHANGE_ALERT_FOR_PR);
			if (rule7360.size()) {
				dbgRuleId = RULES::CHECK_AIRCRAFT_CHANGE_ALERT_FOR_PR;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkAircraftChangeAlertForPR(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7360[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7360[0].idRule, 1);
				if (_debug)
					printf("crew %d :check aircraft change alter for PR.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7360 << endl;
					return false;
				}
			}

			//7361
			auto& rule7361 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_DAYS_OFF_FOR_5J);
			if (rule7361.size()) {
				dbgRuleId = RULES::CHECK_MIN_DAYS_OFF_FOR_5J;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinDaysOffFor5J(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7361[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7361[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min days off for 5j.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7361 << endl;
					return false;
				}
			}

			//7364
			auto& rule7364 = this->_dbData->getRuleFunctions(RULES::CHECK_INEXPERIENCED_CREW_FOR_5J);
			if (rule7364.size()) {
				dbgRuleId = RULES::CHECK_INEXPERIENCED_CREW_FOR_5J;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkInexperiencedCrewFor5J(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7364[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7364[0].idRule, 1);
				if (_debug)
					printf("crew %d :check inexperience crew for 5j.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7364 << endl;
					return false;
				}
			}

			//7365
			auto& rule7365 = this->_dbData->getRuleFunctions(RULES::CHECK_LEGAL_DAYS_OFF_FOR_5J);
			if (rule7365.size()) {
				dbgRuleId = RULES::CHECK_LEGAL_DAYS_OFF_FOR_5J;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkLegalDaysOffFor5J(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7365[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7365[0].idRule, 1);
				if (_debug)
					printf("crew %d :check legal days off for 5j.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7365 << endl;
					return false;
				}
			}

			//7366
			auto& rule7366 = this->_dbData->getRuleFunctions(RULES::CHECK_CONSECUTIVE_DAYS_OFF_REQUIREMENT_FOR_5J);
			if (rule7366.size()) {
				dbgRuleId = RULES::CHECK_CONSECUTIVE_DAYS_OFF_REQUIREMENT_FOR_5J;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkConsecutiveDaysOffRequirementFor5J(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7366[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7366[0].idRule, 1);
				if (_debug)
					printf("crew %d :check consecutive days off requirement for 5j.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7366 << endl;
					return false;
				}
			}

			//7387
			auto& rule7387 = this->_dbData->getRuleFunctions(RULES::CHECK_STANDBY_CALLOUT_DURATION_FOR_5J);
			if (rule7387.size()) {
				dbgRuleId = RULES::CHECK_STANDBY_CALLOUT_DURATION_FOR_5J;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkStandbyCalloutDurationFor5J(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7387[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7387[0].idRule, 1);
				if (_debug)
					printf("crew %d :check standby callout duration for 5j.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7387 << endl;
					return false;
				}
			}

			//7388
			auto& rule7388 = this->_dbData->getRuleFunctions(RULES::LIMIT_COURSE_WEEKDAY_FOR_5J);
			if (rule7388.size()) {
				dbgRuleId = RULES::LIMIT_COURSE_WEEKDAY_FOR_5J;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkCourseWeekdayFor5J(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7388[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7388[0].idRule, 1);
				if (_debug)
					printf("crew %d :check limit course weekday for eva fd.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7388 << endl;
					return false;
				}
			}

			//7389
			auto& rule7389 = this->_dbData->getRuleFunctions(RULES::LIMIT_TRAINING_CONSECUTIVE_DAYS_FOR_5J);
			if (rule7389.size()) {
				dbgRuleId = RULES::LIMIT_TRAINING_CONSECUTIVE_DAYS_FOR_5J;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkTrainingConsecutiveDaysFor5J(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7389[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7389[0].idRule, 1);
				if (_debug)
					printf("crew %d :check training consecutive days for 5J.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7389 << endl;
					return false;
				}
			}

			////7362
			//auto& rule7362 = this->_dbData->getRuleFunctions(RULES::LIMIT_AREA_ENTRY_COUNT_FOR_PR);
			//if (rule7362.size()) {
			//	dbgRuleId = RULES::LIMIT_AREA_ENTRY_COUNT_FOR_PR;
			//	lapsed = clock();
			//	if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
			//		isValid = checkAreaEntryCountForPR(*ix);
			//	lpased2 = clock();
			//	RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7362[0].idRule, (lpased2 - lapsed));
			//	RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7362[0].idRule, 1);
			//	if (_debug)
			//		printf("crew %d :limit area entry count for PR.\n", (*ix)->crewIndex);

			//	if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
			//		cout << 7362 << endl;
			//		return false;
			//	}
			//}

			//7482
			auto& rule7482 = this->_dbData->getRuleFunctions(RULES::ACCLIMATISATION_DEFINITION_FOR_HX);
			if (rule7482.size()) {
				dbgRuleId = RULES::ACCLIMATISATION_DEFINITION_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkTaskOnRecoveryPeriodForHX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7482[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7482[0].idRule, 1);
				if (_debug)
					printf("crew %d :check task on recovery period for HX.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7482 << endl;
					return false;
				}
			}

			//7480
			auto& rule7480 = this->_dbData->getRuleFunctions(RULES::LIMIT_DUTY_DAYS_OFF_FOR_HX);
			if (rule7480.size()) {
				dbgRuleId = RULES::LIMIT_DUTY_DAYS_OFF_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkDutyDaysOffForHX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7480[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7480[0].idRule, 1);
				if (_debug)
					printf("crew %d :check duty days off for HX.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7480 << endl;
					return false;
				}
			}

			//7486
			auto& rule7486 = this->_dbData->getRuleFunctions(RULES::LIMIT_RED_EYE_DUTY_FOR_HX);
			if (rule7486.size()) {
				dbgRuleId = RULES::LIMIT_RED_EYE_DUTY_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkRedEyeDutyForHX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7486[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7486[0].idRule, 1);
				if (_debug)
					printf("crew %d :check red eye duty for HX.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7486 << endl;
					return false;
				}
			}

			//7487
			auto& rule7487 = this->_dbData->getRuleFunctions(RULES::CHECK_MAX_DURATION_FROM_STANDBY_TO_FLIGHT_DUTY_END_FOR_HX);
			if (rule7487.size()) {
				dbgRuleId = RULES::CHECK_MAX_DURATION_FROM_STANDBY_TO_FLIGHT_DUTY_END_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMaxDurationFromStandbyToFlightDutyEndForHX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7487[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7487[0].idRule, 1);
				if (_debug)
					printf("crew %d :check max duration from standby to flight duty end for HX.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7487 << endl;
					return false;
				}
			}

			//7489
			auto& rule7489 = this->_dbData->getRuleFunctions(RULES::LIMIT_CONSECUTIVE_DAY_MIN_REST_FOR_HX);
			if (rule7489.size()) {
				dbgRuleId = RULES::LIMIT_CONSECUTIVE_DAY_MIN_REST_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkConsecutiveDayMinRestForHX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7489[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7489[0].idRule, 1);
				if (_debug)
					printf("crew %d :check consecutive day min rest for HX.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7489 << endl;
					return false;
				}
			}

			//7493
			auto& rule7493 = this->_dbData->getRuleFunctions(RULES::LIMIT_CONSECUTIVE_DUTY_DAYS_OFF_FOR_HX);
			if (rule7493.size()) {
				dbgRuleId = RULES::LIMIT_CONSECUTIVE_DUTY_DAYS_OFF_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkConsecutiveDutyDaysOffForHX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7493[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7493[0].idRule, 1);
				if (_debug)
					printf("crew %d :check limit consecutive duty days off for HX.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7493 << endl;
					return false;
				}
			}

			//7494
			auto& rule7494 = this->_dbData->getRuleFunctions(RULES::LIMIT_FLEET_ASSIGNMENT_BY_QUALIFICATION_FOR_HX);
			if (rule7494.size()) {
				dbgRuleId = RULES::LIMIT_FLEET_ASSIGNMENT_BY_QUALIFICATION_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkFleetSectorByQaulificationForHX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7494[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7494[0].idRule, 1);
				if (_debug)
					printf("crew %d :check fleet assignment by qualification for HX.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7494 << endl;
					return false;
				}
			}
			
			//7495
			auto& rule7495 = this->_dbData->getRuleFunctions(RULES::LIMIT_CONSECUTIVE_TASK_BEFORE_AFTER_DAYSOFF_FOR_HX);
			if (rule7495.size()) {
				dbgRuleId = RULES::LIMIT_CONSECUTIVE_TASK_BEFORE_AFTER_DAYSOFF_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkConsecutiveTaskBeforeAfterDayOffForHX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7495[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7495[0].idRule, 1);
				if (_debug)
					printf("crew %d :check consecutive task before after dayoff for HX.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7495 << endl;
					return false;
				}
			}

			//7496
			auto& rule7496 = this->_dbData->getRuleFunctions(RULES::LIMIT_MIN_WORK_DAYS_BETWEEN_ASSIGNMENTS_FOR_HX);
			if (rule7496.size()) {
				dbgRuleId = RULES::LIMIT_MIN_WORK_DAYS_BETWEEN_ASSIGNMENTS_FOR_HX;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinWorkDaysBetweenAssignmentsForHX(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7496[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7496[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min work days between assignments for HX.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7496 << endl;
					return false;
				}
			}

			//7501
			auto& rule7501 = this->_dbData->getRuleFunctions(RULES::LIMIT_SINGLE_DAY_FREE_FROM_DUTY_FOR_CARS);
			if (rule7501.size()) {
				dbgRuleId = RULES::LIMIT_SINGLE_DAY_FREE_FROM_DUTY_FOR_CARS;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSingleDayFreeFromDutyForCARS(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7501[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7501[0].idRule, 1);
				if (_debug)
					printf("crew %d :check single day free from duty for CARS.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7501 << endl;
					return false;
				}
			}

			//7503
			auto& rule7503 = this->_dbData->getRuleFunctions(RULES::LIMIT_CONSECUTIVE_WOCL);
			if (rule7503.size()) {
				dbgRuleId = RULES::LIMIT_CONSECUTIVE_WOCL;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkConsecutiveWoclForCARS(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7503[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7503[0].idRule, 1);
				if (_debug)
					printf("crew %d :check consecutive WOCL for CARS.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7503 << endl;
					return false;
				}
			}

			//7504
			auto& rule7504 = this->_dbData->getRuleFunctions(RULES::CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_F8);
			if (rule7504.size()) {
				dbgRuleId = RULES::CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_F8;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinSpaceBetweenDutyForF8(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7504[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7504[0].idRule, 1);
				if (_debug)
					printf("crew %d :check min space between duty for F8.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7504 << endl;
					return false;
				}
			}

			//7505 MINIMUM_DAYS_OFF_FOR_CARS
			auto& rule7505 = this->_dbData->getRuleFunctions(RULES::MINIMUM_DAYS_OFF_FOR_CARS);
			if (rule7505.size()) {
				dbgRuleId = RULES::MINIMUM_DAYS_OFF_FOR_CARS;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkMinimumDaysOffForCARS(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7505[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7505[0].idRule, 1);
				if (_debug)
					printf("crew %d :check minimum days off for CARS.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7505 << endl;
					return false;
				}
			}

			//7506 SINGLE_DAILY_CHECKIN_FOR_CARS
			auto& rule7506 = this->_dbData->getRuleFunctions(RULES::SINGLE_DAILY_CHECKIN_FOR_CARS);
			if (rule7506.size()) {
				dbgRuleId = RULES::SINGLE_DAILY_CHECKIN_FOR_CARS;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = checkSingleDailyCheckinForCARS(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule7506[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule7506[0].idRule, 1);
				if (_debug)
					printf("crew %d :check single daily checkin for CARS.\n", (*ix)->crewIndex);

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 7506 << endl;
					return false;
				}
			}

			//check every singel rule
			//#pragma omp parallel for shared(isValid,ix)
			for (std::size_t iRule = 0; iRule < _appRules.size(); ++iRule)
			{
				//mantis#2003, OMP thread safe, move local var singleRule here
				const DBRule& singleRule = _appRules[iRule];

				//dbg info
				dbgRuleId = singleRule.idRule;
				dbgCrewIndex = (*ix)->crewIndex;
				dbgCrewId = this->_dbData->crewList[dbgCrewIndex]->idCrew;

				//Airline specific rules which are developed by themselves.
				//FOR EVA
				if (_debug)
					printf("Checking Rule ID=%d\n", singleRule.idRule);
				//resever for eva
				//if (singleRule.function > 9000 && singleRule.function < 9051)
				//{
				//	lapsed = clock();
				//	if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
				//		isValid = checkCustomizedRules(*ix, &singleRule);
				//	lpased2 = clock();
				//	RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
				//	RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
				//	continue;
				//}

				switch (singleRule.function)
				{
				case RULES::MAX_CUM_BLOCK:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMaxCummulative(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);

					if (_debug)
						printf("crew %d :check max cummulative block time rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MAX_CUM_FDP:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMaxCummulative(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check max cummulative FDP rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MAX_CUM_BLOCK2:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMaxCummulative2(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);

					if (_debug)
						printf("crew %d :check 2max cummulative block time rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MAX_CUM_FDP2:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMaxCummulative2(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check 2max cummulative FDP rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MAX_CUM_DP2:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMaxCummulative2(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check 2max cummulative DP rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MAX_ATTRIBUTE:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMaxAttribute(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check max attribute rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::ATTRIBUTE_SPACING:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkAttributeSpace(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check attribute space rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MAX_BLOCK_PERDUTY_R4:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkBlockPerDuty(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check max block per duty rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MAX_FDP_PERDUTY_R4:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						checkFDPPerDuty(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check max PDF per duty rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MIN_REST_IN_XHOURS:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMinRestIn7Days(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check min rest in 7 days rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MIN_GAP_BTW_DISCRETIONS:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkGapBtwTwoDiscretions(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check gap between two duties with discretions.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MIN_REST_IN_XHOURS_R5:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMinRestIn7Days_R5(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("R5:crew %d :check min rest in 7 days rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::TRAVEL_DOCUMENT:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER) || (*ix)->needCheckQual)
						isValid = checkTravelDocument(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check travel document rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::QUAL_COMBINATION:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkQualCombination(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check qualication combination rule.\n", (*ix)->crewIndex);
					break;

				}
				case RULES::GENERAL_DUTYGROUP_QUAL:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER) || (*ix)->needCheckQual)
						isValid = checkDutyGroupReqQual(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check qualication combination rule.\n", (*ix)->crewIndex);
					break;

				}
				case RULES::PORT_REQUIREMENT:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkPortRequirements(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check port requirements rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MIN_TAKEOFFS_IN_YDAYS:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMinTakeOffInYDays(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check Min TakeOff In Y Days rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::DO_GAP:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkDOGap(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check DO Gap rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::MAX_LOCAL_NIGHTS:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMaxLocalNights(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check max local nights in a range rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::LOCATION_CONTINUITY:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkLocationContinuity(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check port requirements rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::BASIC_COMPETENCY:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkBasicCompetency(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :check basic competency rule.\n", (*ix)->crewIndex);
					break;
				}
				case RULES::PAIRING_LIMITATION:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkPairingLimitation(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("check pairing limitation rules.\n");
					break;
				}
				case RULES::DUTY_LIMITATION:{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkDutyLimitation(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("check duty limitation rules.\n");
					break;
				}
				case RULES::ACTING_RANK: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkActingRank(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("check actring rank rules.\n");
					break;
				}
				case RULES::ULR_REST_CHECK: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkULRRest(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("check ULR rest rules.\n");
					break;

				}
				case RULES::SCH_ULR_REST_CHECK_FOR_EVA_FD: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkSchULRRest_ForEvaFd(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("check schedule ULR rest rules.\n");
					break;

				}
				case RULES::ACCLIMATIZED_REST: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkAcclimatizedRest(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("check acclimatized rest rules.\n");
					break;

				}
				case RULES::MAX_PROBATION_CROSSRANKS: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMaxProbationCrossRank(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("check max probation cross rank rules.\n");
					break;

				}
				case RULES::MAX_PROBATION_PERRANK: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMaxProbationPerRank(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("check max probation per rank rules.\n");
					break;

				}
				case RULES::MIN_PROBATION_PERRANK: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkMinProbationPerRank(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("check min probation per rank rules.\n");
					break;

				}
				case RULES::AIRPORT_RECENCY_TKOLDG: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkRecency(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("airport recency & takeoff/landing checker.\n");
					break;
				}
				case RULES::DAYSOFF_CHECK: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = checkDaysOff(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Days off checker.\n");
					break;
				}
				case RULES::DAYSOFF_AFTER_ATTRIBUTE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkDaysOffAfterAttribute(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Days off checker.\n");
					break;
				}
				//8114
				case RULES::CREW_RANK_FLEETSPECIFIC_RESTRICTION:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkCrewRankFleetSpecial(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew_Rank_Fleet_Special checker.\n");
					break;
				}
				//8092
				case RULES::EXPAT_CREW_COMBINATION_RESTRICTION:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER)){
						if ((*ix)->PairingIndex >= 0 && (*ix)->PairingIndex < (int)this->_dbData->pairingList.size()){
							isValid = this->checkExpatCrewCombinationRestriction(this->_dbData->pairingList[(*ix)->PairingIndex], &singleRule, "");//crewAId = ""
						}
						else if ((*ix)->crewIndex >= 0 && (*ix)->crewIndex < (int)this->_dbData->crewList.size()){
							auto& crewA = _dbData->crewList[(*ix)->crewIndex];
							vector<shared_ptr<ROSTER>> rosters = crewA->rosterList;
							for (std::size_t i = 0; i < rosters.size(); i++){
								bool isPtnValid = this->checkExpatCrewCombinationRestriction(rosters[i]->pairing, &singleRule, crewA->idCrew);
								//mantis#7488  防止多pairing检查覆盖 false即跳出
								//20200829 ain, mantis#8682, 修正一个crew只能查出一个8092 ptn违规问题
								if (!isPtnValid)
									isValid = false;
							}		
						}
						if (!isValid)(*ix)->isLegal = false;
					}
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("EXPAT_CREW_COMBINATION_RESTRICTION checker.\n");
					break;
				}
				case RULES::MAX_ASSIGNMENT_GROUP:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxAssignmentGroup(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Max Assignment Group checker.\n");
					break;

				}
				case RULES::RESTRICT_DUTY_BY_CREW_NATIONALITY: {
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER) || (*ix)->needCheckQual)
						isValid = checkDutyByCrewNationality(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("crew %d :Restrict duty by the crew nationality rule.\n", (*ix)->crewIndex);
					break;
				}
			/*	case RULES::MAX_STUDENT_IN_FLIGHT:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxStudentInflight(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("MAX_STUDENT_IN_FLIGHT checker.\n");
					break;

				}*/
				case RULES::PILOT_AGE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkPilotAge(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Pilot age checker.\n");
					break;

				}
				case RULES::NOWORKING_ON_CREW_BIRTHDAY:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkDutyOnCrewBirthday(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Duty on crew birthday checker.\n");
					break;

				}
				case RULES::CREW_TEAM_ROSTER:
				{
					DBG_HELP3("RULES::CREW_TEAM_ROSTER");
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkTeamRoster(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Team Roster checker.\n");
					DBG_HELP3("RULES::CREW_TEAM_ROSTER leave");
					break;

				}  //checkTeamRoster
				case RULES::MAX_CONSECUTIVE_EARLY_DUTY:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxConsecutiveEarlyDuty(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Max Consecutive Early Start Duty checker.\n");
					break;

				}
				case RULES::CHECK_CONSECUTIVE_EARLY_DUTY:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->CheckMaxConsecutiveEarlyStart(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Max Consecutive Early Start Duty checker.\n");
					break;

				}

				case RULES::CHECK_MAX_EARLY_DUTY_IN_ANY_CONSECUTIVE_DAY:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->CheckMaxEarlyDutyInAnyConsecutiveDay(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Max Early Start Duty In Any Consecutive Day checker.\n");
					break;

				}

				case RULES::CHECK_MAX_CONSECUTIVE_NIGHTS_AWAY_FROM_BASE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->CheckMaxConsecutiveNightsAwayFromBase(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Max Consecutive Nights Away From Base checker.\n");
					break;

				}

				case RULES::CHECK_WORKING_DAYS_LIMIT:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->CheckWorkingDaysLimit(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew working days limit checker.\n");
					break;

				}

				case RULES::ANR_CONSECUTIVE_SPECIAL_DUTY:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkAnrConsecutiveSpecialDuty_ANR(*ix);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("ANR consecutive special duty checker.\n");
					break;

				}

				case RULES::ANR_DAY_OFF_SPACING:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkAnrDayOffSpacing_ANR(*ix);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("ANR day off spacing checker.\n");
					break;

				}

				case RULES::ANR_MIN_DAYS_OFF_IN_PERIOD:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkAnrMinDayOffInPeriod_ANR(*ix);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("ANR min days off in period checker.\n");
					break;

				}
				case RULES::ANR_MIN_REPORTING_DEBRIEF:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkAnrReportingDebrief_ANR(*ix);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("ANR reporting + debrief minimum checker.\n");
					break;

				}
				case RULES::CHECK_CONSECUTIVE_WOCL_DUTY:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->CheckMaxConsecutiveWOCLDuty(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Max Consecutive WOCL Duty checker.\n");
					break;

				}
				case RULES::MAX_DAYS_AWAYFROM_BASE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxDaysAwayFromBase(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Max Days Away From Base.\n");
					break;

				}
				case RULES::MAX_DAYS_AWAYFROM_BASE2:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxDaysAwayFromBase2(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Max Days Away From Base 2.\n");
					break;

				}
				case RULES::MIN_CONSECUTIVE_DO:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMinConsecutiveDaysOff(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Min Consecutive Days Off.\n");
					break;

				}
				case RULES::ADDITIONAL_REST:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkAdditionalRest(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Additional Rest check.\n");
					break;

				}
				//
				case RULES::ASSIGNMENTS_SPACING:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkRosterSpace(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew rosters spacing check.\n");
					break;

				}
				//
				case RULES::CONSECUTIVE_ROSTER:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkConsecutiveRosters(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Consecutive rosters days check.\n");
					break;
				}
				//
				case RULES::MAX_EXPATCREW_ON_COF:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxExpatCrewOnFlight(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Max Expat Crew on COF check.\n");
					break;
				}
				//NEXT_ROSTER_AFTER_MOVEPATTERN
				case RULES::NEXT_ROSTER_AFTER_MOVEPATTERN:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkNextRosterAfterMovingPattern(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Next roster check after move pattern.\n");
					break;
				}
				//MIN_DO_PER_AL
				case RULES::MIN_DO_PER_AL:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMinDOPerAL(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Min DO per Annual Leave.\n");
					break;
				}
				case RULES::MIN_DO_EARLY_DUTY:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMinDOBeforeEarlyDuty(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Min DO before early FLY/SBY duty.\n");
					break;
				}
				case RULES::MAX_LIMITAION_PLUS_ADDITIONAL:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxFTSBY(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Max FT/FDP/DP+Additional time in a calendar month.\n");
					break;
				}//
				case RULES::MIN_RESTS_AFTER_CONSECUTIVE_DUTIES:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMinRestsAfterWorkingDuties(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Min rest duties after X consecutive working duties.\n");
					break;
				}//
				case RULES::MAX_XFLY_IN_YDAYS:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkXFLYInYDays(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Max fly rosters in days.\n");
					break;
				}//
				case RULES::MAX_CONSECUTIVE_ROSTER_ATTRIBUTE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxConsecutiveRosterWithAttr(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Max Consecutive Roster With Attribute.\n");
					break;
				}//
				case RULES::MAX_DOWNGRADE_ON_COF:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxDowngradeOnFlight(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Max downgrade on flight per flight & ranks.\n");
					break;
				}//
				case RULES::MAX_DOWNGRADE_PER_CREW:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxDowngrade(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Max downgrade for crew in the specified periold.\n");
					break;
				}//
				case RULES::MAX_DOWNGRADE_IN_SCENARIO:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxDowngradeInAScenario(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Max downgrade per rank in a scenario.\n");
					break;
				}//
				case RULES::EVA_CREW_PREFERENCES:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkCrewPreference(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[EVA]Check the Crew Preference.\n");
					break;
				}
				case RULES::GEN_CREW_PREFERENCES:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkGenCrewPreference(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[GEN]Check the Crew Preference.\n");
					break;
				}
				case RULES::CA_ROSTER_BRING_LIMITATION:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkRosterBringLimitation(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[CA]Check the Roster Limitation after stations.\n");
					break;
				}
				case RULES::CREW_FLEET_RECENCY:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkCrewFleetRecency(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check the Crew Fleet Recency.\n");
					break;
				}
				case RULES::MIN_QAL_PER_FLEET_RANK_EVA:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMinQualByFleetAndRank(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[EVA]Check the min qualfication by fleet and acting rank.\n");
					break;
				}
				case RULES::ROSTER_SPACING:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkRosterSpaceByLableAndAtt(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check the rosters space.\n");
					break;
				}
				case RULES::SCH_ROSTER_SPACING_FOR_EVA_FD:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkSchRosterSpaceByLableAndAtt_ForEvaFd(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check schedule the rosters space.\n");
					break;
				}
				case RULES::EVA_CREW_FLY_TOGETHER:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkCrewFlyTogether(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[EVA]Check crew fly together.\n");
					break;
				}
				case RULES::GEN_CREW_FLY_TOGETHER:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkGenCrewFlyTogether(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[Gen]Check crew fly together.\n");
					break;
				}
				case RULES::MIN_CREW_AT_LO:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMinCrewAtLayoverByBase(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check min crew at layover by crew base.\n");
					break;
				}
				case RULES::MIN_EXP_CREW_ON_COF:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkPercentageOfExpCrew(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check the pencertage of QCA on standby.\n");
					break;
				}
				case RULES::ANNUAL_LEAVE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkAnnualLeave(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Crew Annual Leave Check.\n");
					break;
				}
				case RULES::MIN_REST_BEFORE_ASSGN:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMinRestBeforeAssgngroup(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Min rest before FT/SB[New AOR].\n");
					break;
				}
				case RULES::HOME_STANDBY_LIMITATION:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkHomeStandby(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Home Standby Limitation Check.\n");
					break;
				}
				case RULES::EVA_ADO:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkADOinWeeks(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("EVA ADO Check.\n");
					break;
				}
				case RULES::ROSTERS_DIRECT_CONNECTION_LIMITATION:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkRosterConnByLableAndAtt(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Two rosters with properties should not be directly connected.\n");
					break;
				}
				case RULES::MIN_DO_AFTER_HOME_BASE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMinDOAfterHome(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check Min DO after post duty (home base) for nationality crew .\n");
					break;
				}
				case RULES::MAX_CONSECUTIVE_LATE_DUTY:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxLateDuties(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check Max Consecutive Late Duties.\n");
					break;
				}
				case RULES::MIN_REST_AFTER_OUTOFBASE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkRestAfterLongAwayBase(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check rest after long away from home base.\n");
					break;
				}
				case RULES::GENERAL_DO_REQUIREMENTS:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkGeneralDOReq(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check general DO requirements by lable/attribute/roster duty....\n");
					break;
				}
				case RULES::PROBATION_CHECK_BY_RANK:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkProbationbyRank(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check probation rule by rank....\n");
					break;
				}
				case RULES::PROBATION_CHECK_BY_QUAL:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkProbationbyQual(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check probation rule by qualification....\n");
					break;
				}
				case RULES::MIN_MAX_BY_ROSTER_PROPERTIES:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxRosterProperties(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Max/min Assignment Group/label/attribute/qualifier checker.\n");
					break;

				}
				case RULES::MIN_QAL_PER_FLEET_RANK:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkGenMinQualByFleetAndRank(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[Gen] Check the min/max qualfication by fleet and acting rank.\n");
					break;
				}
				case RULES::CA_RADIO_OFFICER_COMBINED_QULS:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkCOFCombinedQuals(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[CA] Check the crew radio officers' combined qualfications on flight by fleet and acting rank.\n");
					break;
				}
				case RULES::CA_EXEMPT_FLIGHT_REST:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkExemptFlightRest(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[CA] Check the crew rest for the exempt flights.\n");
					break;
				}
				case RULES::CA_CHECK_QUARANTINE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkQuarantinePeriod(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[CA] Check the crew historical quarantine period.\n");
					break;
				}				
				case RULES::MAX_PTN_IN_SCENARIO:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxPatternInScenario(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[Gen] Check the max pattern by a scenario.\n");
					break;
				}
				case RULES::MAX_PTN_BY_DATE:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxPatternByDate(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("[Gen] Check the max pattern by date.\n");
					break;
				}
				case RULES::INSTRUCTOR_STUDENT_BOUND:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkInstructorStudentBound(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check 8074 instructor student bound.\n");
					break;
				}
				//8006
				case RULES::CREW_APPLICABLE_PTN:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkApplicablePTNForCrew(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("Check 8006 Crew applicable PTNs.\n");
					break;
				}
				case RULES::EVA_MAX_EXPATCREW_ON_COF:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkEVAMaxExpatCrewOnFlight(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("EVA Max Expat Crew on COF check.\n");
					break;
				}
				case RULES::ROSTER_LIMITATION_ON_OUTSTATION:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkRosterLimitationOnOutstation(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8076-Roster Limitation on outstation.\n");
					break;
				}
				case RULES::CUM_LIMIT_ASSIGNMENT:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxCummulativeExtensiton(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8125-Max BLH/FDP on certain roster(SBY).\n");
					break;
				}
				case RULES::QUALS_COMBINATIONS:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkCOFQualCombination(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8126-Crew On Flight Qual Cominbations(Allowd/not Allowed) check.\n");
					break;
				}
				case RULES::MULTIPLE_QUALS_CHECK:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkCOFMultipleQuals(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8127-Crew On Flight Multiple Quals check.\n");
					break;
				}
				case RULES::MAX_CREW_ON_PAIRING:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxCrewOnPairing(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8077-Max crew on pairing checking.\n");
					break;
				}
				case RULES::PTN_REQUIRED_CREW:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkPtnRequiredCrew(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8106-PtnRequiredCrew checking.\n");
					break;
				}
				case RULES::MIN_CONSECUTIVE_REST:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMinConsecutiveRest(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8078-Min Rest in the ranges.\n");
					break;
				}
				case RULES::MONTHLY_ASSIGNMENTS:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMonthlyAssignments(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8079-Monthly DO Checking.\n");
					break;
				}
				case RULES::SWAP_TIMES_CHECK:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkTimesInSwap(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8081-Check the BT/FT/FDP... for Swap.\n");
					break;
				}
				case RULES::SWAP_DO_CHECK:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkDaysOffInSwap(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8082-Check the YDO... for Swap.\n");
					break;
				}
				/* already restby by setMinRestByFDP
				case RULES::SET_MIN_REST_BY_FDP:
				{
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
				this->resetMinRestInRoster(*ix, &singleRule);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
				if (_debug)
				printf("8080-Reset min rest for roster.\n");
				break;
				}*/
				case RULES::DUMMY_FT_CHECK:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxDummyFt(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8083-Dummy FT check.\n");
					break;
				}
				case RULES::ADVISOR_RATIO:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkAdvisorInSwap(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8084-Advisor check in SWAP.\n");
					break;
				}
				case RULES::ROLE_CHECK:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkNumberOfRoles(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8085-Number of Roles check.\n");
					break;
				}
				case RULES::SWAP_MAX_AL:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxALInSwap(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8086-SWAP max AL check.\n");
					break;
				}
				case RULES::SWAP_FT_CHECK:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxFTInSwap(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8087-SWAP FT check.\n");
					break;
				}
				case RULES::COMMUTE_CALC_CHECK:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkCommute(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8089-Legal rest + commute check.\n");
					break;
				}
				case RULES::ROSTER_SPACE_BY_WP:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkRosterSpaceByWP(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8090-Check Roster Space by WP.\n");
					break;
				}
				case RULES::MAX_CONSECUTIVE_DUTY_DAYS_R6:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxConsecutiveDuty_R6(*ix);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8115 MAX_CONSECUTIVE_DUTY_DAYS_R6\n");
					break;
				}
				case RULES::MAX_CONSECUTIVE_DUTY_DAYS_QQ:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxConsecutiveDutyDay_QQ(*ix);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("6115 MAX_CONSECUTIVE_DUTY_DAYS_QQ\n");
					break;
				}
				case RULES::MAX_ABROAD_DAYS:
				{
					lapsed = clock();
					if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
						isValid = this->checkMaxAbroadDays(*ix);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8116 MAX_ABROAD_DAYS\n");
					break;
				}
				case RULES::RANK_POSITION_COMB:
				{
					lapsed = clock();
					//20190807 ain, mantis#6417, 是否走8091流程判断:
					//1 不是RO
					//2 或是RO 且未发现违规
					if (this->GetApplication() != ROSTER_OPTIMIZER ||
						(isValid && this->GetApplication() == ROSTER_OPTIMIZER)) {
						if (this->_dbData->version == 2) {
							isValid = this->checkRankPositionComb(*ix, &singleRule);
						}
						else if (this->_dbData->version == 3) {
							isValid = this->checkRankPositionCombFor3(*ix, &singleRule);
						}
					}

					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8091-Check Roster rank/position combination.\n");
					break;
				}
				case RULES::MAX_CUM_FATIGUE:{
					lapsed = clock();
					isValid = checkMaxCummuFatigue(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("8105-check max fatigue in a range.\n");
					break;
				}
				case RULES::CHECK_ONLY_MIN_REST:{
					lapsed = clock();
					isValid = this->checkRest2125(*ix, &singleRule);
					lpased2 = clock();
					RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
					if (_debug)
						printf("2125 min rest check-only.\n");
					break;
				}
				default:
					//printf("crew %d :no corresponding rule function.\n", (*ix)->crewIndex);
					break;
				}
				
				//For RO, return false whenever it finds an invalid assignment
				if (isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					clock_t ruleTime = clock() - ruleBegin;
					RuleStatistics::GetInstancePtr()->addRuleCallClock(0, ruleTime);
					RuleStatistics::GetInstancePtr()->addRuleCallTimes(0, 1);
					if (_debug_RO) {
						cout << dbgRuleId << endl;
					}
					return false;
				}
			}

			auto& rule6001 = this->_dbData->getRuleFunctions(RULES::MIN_CONSECUTIVE_RDO);
			if (rule6001.size())
			{
				dbgRuleId = RULES::MIN_CONSECUTIVE_RDO;
				lapsed = clock();
				if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
					isValid = this->checkMinConsecutiveRosterDaysOff(*ix);
				lpased2 = clock();
				RuleStatistics::GetInstancePtr()->addRuleCallClock(rule6001[0].idRule, (lpased2 - lapsed));
				RuleStatistics::GetInstancePtr()->addRuleCallTimes(rule6001[0].idRule, 1);
				if (_debug)
					printf("Crew Min Consecutive Roster Days Off.\n");

				if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
					cout << 6001 << endl;
					return false;
				}
			}

		}

	}
	catch (char* ex) {
		//mantis#1166, 增加调试信息
		Logger::getRuleLogger()->error("ERROR: exception, {} checkRule rule={}, crewIndex={}, crewId={}", ex, dbgRuleId, dbgCrewIndex, dbgCrewId);
		return false;
	}
	catch (string& ex) {
		//mantis#1166, 增加调试信息
		Logger::getRuleLogger()->error("ERROR: exception, {} checkRule rule={}, crewIndex={}, crewId={}", ex, dbgRuleId, dbgCrewIndex, dbgCrewId);
		return false;
	}
	catch (exception& ex) {
		//mantis#1166, 增加调试信息
		Logger::getRuleLogger()->error("ERROR: exception, {} checkRule rule={}, crewIndex={}, crewId={}", ex.what(), dbgRuleId, dbgCrewIndex, dbgCrewId);			
		return false;
	}
	catch (...) {
		//mantis#1166, 增加调试信息
		Logger::getRuleLogger()->error("ERROR: exception=unknown checkRule rule={} crewIndex={} crewId={}", dbgRuleId, dbgCrewIndex, dbgCrewId);
		return false;
	}

	//map<string, CalculationManday>& maps = this->_dbData->_calculationMandayMap;
	//check min rest/max fdp/max dp ....
	//if (this->_application != ROSTER_OPTIMIZER)
	//{
	//	for (vector<RULE_LEGALITY*>::iterator ix = checkList.begin(); ix != checkList.end(); ++ix)
	//	{
	//		vector<SharedPtr<ROSTER>>&  rosters = this->_dbData->crewList[(*ix)->crewIndex]->rosterList;
	//		if ((*ix)->RosterIndex >= 0 && (*ix)->RosterIndex >= (int)rosters.size())
	//		{
	//			clock_t ruleTime = clock() - ruleBegin;
	//			RuleStatistics::GetInstancePtr()->addRuleCallClock(0, ruleTime);
	//			RuleStatistics::GetInstancePtr()->addRuleCallTimes(0, 1);
	//			printf("Assert Error: crew(%d),roster index(%d) exceeds the roster size.\n", (*ix)->crewIndex, (*ix)->RosterIndex);
	//			return true;
	//		}
	//		size_t iRoster = 0;
	//		for (; iRoster < rosters.size(); ++iRoster)
	//		{
	//			if (!(rosters[iRoster]->pairing))
	//				continue;
	//			//rosters[iRoster]->pairing->calcuate(maps);
	//			//20181016 ain, 重构 fdp/dp/bh计算
	//			calculatePairingDutyTimes(rosters[iRoster]->pairing, _dbData.get());
	//		}
	//	}

	//}

	//check general rule, Rule 0000 必须最后做检查
	for (vector<RULE_LEGALITY*>::iterator ix = checkList.begin(); ix != checkList.end(); ++ix)
	{
		lapsed = clock();
		if ((isValid) || (this->GetApplication() != ROSTER_OPTIMIZER))
			isValid = this->checkGeneralRule(*ix);
		lpased2 = clock();
		if (_debug)
			printf("Crew check general rule.\n");

		if (_debug_RO && isValid == false && this->GetApplication() == ROSTER_OPTIMIZER) {
			cout << 0 << endl;
			return false;
		}
	}

	DBG_HELP3("LegalityChecker::checkRules(vector<RULE_LEGALITY *> checkList) LEAVE");

	clock_t ruleTime = clock() - ruleBegin;
	RuleStatistics::GetInstancePtr()->addRuleCallClock(0, ruleTime);
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(0, 1);

	return isValid;

}


int  LegalityChecker::getCrewIndex(string strCrewId)
{
	int returnVal = -1;
	std::size_t iCrewSize = this->_dbData->crewList.size();
	for (std::size_t ij = 0; ij < iCrewSize; ++ij){
		if (this->_dbData->crewList[ij]->idCrew == strCrewId) {
			returnVal = (int)ij;
			break;
		}
	}
	return returnVal;
}

bool LegalityChecker::isCrewQualifyForPairingToProbationRule(SharedPtr<CREW>& crew, Pairing* pairing, string actingRank)
{

	clock_t ruleBegin = clock();
	DBG_HELP("LegalityChecker[8069]::isCrewQualifyForPairingToProbationRule(SharedPtr<CREW>& crew, Pairing* pairing, string actingRank)");

	auto rules = this->_dbData->getRuleFunctions(RULES::PROBATION_CHECK_BY_RANK);

	bool isValid = true;
	clock_t lapsed, lpased2;

	for (size_t iRule = 0; iRule < rules.size(); iRule++)
	{

		DBRule& singleRule = rules[iRule];
		lapsed = clock();
		isValid = checkProbationbyRank(crew, pairing, actingRank, &singleRule);

		lpased2 = clock();
		RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
		RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
		if (_debug)
			printf("crew %s :check isCrewQualifyForPairingToProbationRule rule.\n", crew->idCrew.c_str());
		if (!isValid)
			return isValid;

	}

	return isValid;

}


bool LegalityChecker::isCrewQualifyForPairing(SharedPtr<CREW>& crew, Pairing* pairing, string actingRank)
{

	clock_t ruleBegin = clock();
	DBG_HELP("LegalityChecker::isCrewQualifyForPairing(SharedPtr<CREW>& crew, Pairing* pairing, string actingRank)");

	_violations.clear();

	//根据Application过滤法规
	//vector<DBRule> tempList = filterRules(this->_dbData->ruleList, this->GetApplication());

	bool isValid = true;
	clock_t lapsed, lpased2;

	for (size_t iRule = 0; iRule < _appRules.size(); iRule++)
	{
		DBRule& singleRule = _appRules[iRule];

		switch (singleRule.function)
		{
		case RULES::TRAVEL_DOCUMENT:{
			lapsed = clock();
			isValid = checkTravelDocByPairing(crew, pairing, &singleRule);
			lpased2 = clock();
			RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
			RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
			if (_debug)
				printf("crew %s :check travel document rule.\n", crew->idCrew.c_str());
			break;
		}
		case RULES::PORT_REQUIREMENT:{
			lapsed = clock();
			isValid = checkPortReqByPairing(crew, pairing, actingRank);
			lpased2 = clock();
			RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
			RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
			if (_debug)
				printf("crew %s :check port requirements rule.\n", crew->idCrew.c_str());
			break;
		}
		case RULES::GENERAL_DUTYGROUP_QUAL:{
			lapsed = clock();
			isValid = checkGroupReqQualByPairing(crew, pairing, actingRank, &singleRule);
			lpased2 = clock();
			RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
			RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
			if (_debug)
				printf("crew %s :check qualication combination rule.\n", crew->idCrew.c_str());
			break;

		}
		case RULES::BASIC_COMPETENCY:{
			lapsed = clock();
			isValid = checkBasicCompetencyByPairing(crew, pairing, actingRank, &singleRule);
			lpased2 = clock();
			RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
			RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
			if (_debug)
				printf("crew %s :check basic competency rule.\n", crew->idCrew.c_str());
			break;
		}
		case RULES::CREW_APPLICABLE_PTN:{
			lapsed = clock();
			isValid = checkAttributeByPairing(crew, pairing, actingRank, &singleRule);
			lpased2 = clock();
			RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
			RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
			if (_debug)
				printf("crew %s :check applicable attributes for crew.\n", crew->idCrew.c_str());
			break;
		}
		case RULES::CHECK_CREW_COUNTRY_LIMITATION: {
			lapsed = clock();
			isValid = CheckCrewCountryLimitationForPairing(crew, pairing);
			lpased2 = clock();
			RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
			RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
			if (_debug)
				printf("crew %s :check crew country limitation.\n", crew->idCrew.c_str());
			break;
		}
		case RULES::PTN_REQUIRED_CREW: {
			lapsed = clock();
			isValid = checkPtnRequiredCrewForPairing(crew, pairing, &singleRule);
			lpased2 = clock();
			RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
			RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
			if (_debug)
				printf("crew %s :check ptn required crew.\n", crew->idCrew.c_str());
			break;
		}
										/*case RULES::ROSTER_SPACING:{
										lapsed = clock();
										isValid = checkRosterSpaceByLableAndAtt(crew, pairing, &singleRule);
										lpased2 = clock();
										RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
										RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
										if (_debug)
										printf("crew %d :check roster space for crew.\n", crew->idCrew);
										break;
										}*/
		default:
			break;
		}

		if (!isValid)
			break;			
	}


	DBG_HELP3("LegalityChecker::isCrewQualifyForPairing(SharedPtr<CREW>& crew, Pairing* pairing, string actingRank) LEAVE");
	clock_t ruleTime = clock() - ruleBegin;
	RuleStatistics::GetInstancePtr()->addRuleCallClock(0, ruleTime);
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(0, 1);

	return isValid;

	/*
	legal = checkPortReqByPairing(crew, pairing, actingRank);
	if (!legal)
	return false;

	legal = checkBasicCompetencyByPairing(crew, pairing, actingRank);
	if (!legal)
	return false;

	legal = checkGroupReqQualByPairing(crew, pairing, actingRank);
	if (!legal)
	return false;

	//return true;

	legal = checkTravelDocByPairing(crew, pairing);
	if (!legal)
	return false;


	return true;
	*/
}

bool LegalityChecker::callSingleRuleCheck(SharedPtr<CREW>& crew, Pairing* pairing, string actingRank, unsigned int ruleFunc)
{
	clock_t ruleBegin = clock();
	DBG_HELP("LegalityChecker::callSingleRuleCheck(SharedPtr<CREW>& crew, Pairing* pairing, string actingRank)");

	_violations.clear();

	bool isValid = true;
	clock_t lapsed, lpased2;

	for (size_t iRule = 0; iRule < _appRules.size(); iRule++)
	{
		DBRule& singleRule = _appRules[iRule];

		if (singleRule.function != ruleFunc)
			continue;

		if (singleRule.function == 8056)
		{
			lapsed = clock();
			isValid = checkRosterSpaceByLableAndAtt(crew, pairing, &singleRule, false); //isDebug=false
			lpased2 = clock();
			RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
			RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
			if (_debug)
				printf("crew %s :check roster space for crew.\n", crew->idCrew.c_str());
		}

	}

	return isValid;
}


/*Roster关于Base Fleet，Rank检查*/
bool LegalityChecker::checkBasicCompetency(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	string crewid = crew->idCrew;

	//mantis#2184, 8004, rule-param cache
	rule8004 * cache = (rule8004*)singleRule->parsedParam.get();
	string strBase = cache->strBase;
	string strRank = cache->strRank;
	string strFleet = cache->strFleet;
	string strType = cache->strType;
	string strUnit = cache->strUnit;
	string strAssignments = cache->assignments;
	transform(strType.begin(), strType.end(), strType.begin(), ::toupper);
	bool isEnabled = cache->isEnable;
	int iGracePeriod = cache->iGracePeriod;
	long lGrace = cache->lGrace;

	vector<string> assignments;
	split(strAssignments, '|', assignments);

	if (!isEnabled)
		return true;

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;
	vector<DBRankActing>& actingRanks = this->_dbData->rankActingList;
	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	long long expTime = 0;

	vector<SharedPtr<ROSTER>>::iterator iter_roster;

	vector<string>& scenarioActingRanks = this->_dbData->scenario.actingRanks;
	vector<string>& scenarioActiveRanks = this->_dbData->scenario.ranks;
	string rankCross = this->_dbData->scenario.rankCross;

	string fleet, base, rank, rosterid;
	bool bFoundBase = false, bFoundRank = false, bFoundFleet = false;
	string message;
	time_t roster_start, roster_end;
	for (iter_roster = rosters.begin(); iter_roster != rosters.end(); ++iter_roster)
	{
		if (!(*iter_roster)->needRuleCheck && this->_application == ROSTER_OPTIMIZER)
		{
			//if (crew->idCrew == "E48966" && (*iter_roster)->actStrUtc > 1557187200)
			//	cout << "Crew[E48966] No need to check rule:" << (*iter_roster)->source << endl;
			continue;
		}

		// 地面任务只需要校验人员状态，不需要校验机型等
		if (!((*iter_roster)->pairing) && strType != "STATUS")
			continue;

		string rosterAssignment = (*iter_roster)->duty;

		if (strAssignments != "*")
		{
			if (std::find(assignments.begin(), assignments.end(), rosterAssignment) == assignments.end())
				continue;
		}

		//地面任务没有actingRank
		if ((*iter_roster)->pairing) {
			rank = (*iter_roster)->actingRank;

			// ROSCRW-4734 增加非必须rank判断，如果是非必须rank或者非Crew Rank，则不用检查
			if (!this->_dbData->rankMap[rank].isMustCrewRank || !this->_dbData->rankMap[rank].isCrewRank) {
				continue;
			}
		}
		

		base = (*iter_roster)->location;
		if ((*iter_roster)->pairing)
			base = (*iter_roster)->pairing->getBase();

		roster_start = (*iter_roster)->actStrUtc;
		roster_end = (*iter_roster)->actRestStrUtc;

		bFoundBase = false, bFoundRank = false, bFoundFleet = false;

		if (strType == "BASE")
		{
			for (vector<SharedPtr<CREW_BASE>>::iterator iter = bases.begin(); iter != bases.end(); ++iter)
			{
				if ((*iter)->base == base || Utility::isInSameBase((*iter)->base, base))
				{
					if ((*iter)->expUtc < 0 || (*iter)->expUtc == NULL)
					{
						expTime = time(NULL) + 2 * 365 * 24 * 60 * 60;
					}
					else
						expTime = (*iter)->expUtc;
					expTime += lGrace;
					if (((*iter)->effUtc <= roster_start) && expTime > roster_end)
						bFoundBase = true;
				}
			}

			if (!bFoundBase)
			{
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				rosterid = Utility::GetInstancePtr()->llToa((*iter_roster)->rosterId);
				pCrew->isLegal = false;
				message = StringUtils::Format("{0:crewId}: No base ({1:base}) assigned in roster.", crewid, base);
				this->setLegalityMessage((*iter_roster), pCrew, singleRule, message);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crewid;
				rv->rosterId = (*iter_roster)->rosterId;
				rv->startDTUtc = (*iter_roster)->actStrUtc;
				rv->endDTUtc = (*iter_roster)->actEndUtc;
				rv->pairingId = (*iter_roster)->pairId;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("Type", base));
				rv->operation_result.insert(pair<string, string>("label", (*iter_roster)->label));
				rv->operation_result.insert(pair<string, string>("strType", strType));
				this->addRuleViolations(rv, singleRule);
				/*if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}*/
			}
		}

		if (strType == "RANK")
		{

			string activeRank = "NULL";
			for (vector<SharedPtr<CREW_RANK>>::iterator iter = ranks.begin(); iter != ranks.end(); ++iter)
			{
				if ((*iter)->expUtc < 0 || (*iter)->expUtc == NULL)
				{
					expTime = time(NULL) + 2 * 365 * 24 * 60 * 60;
				}
				else
					expTime = (*iter)->expUtc;
				expTime += lGrace;
				//mantis#1716, 按roster_start是否在 crew_rank时间段内判断
				//if ((*iter)->effUtc < roster_start && expTime>roster_end)
				//0001935: 8004 任务环开始应该在级别生效之后，任务环结束应该在级别失效之前
				//change it back by 1935
				if ((*iter)->effUtc <= roster_start && expTime > (*iter_roster)->actRestStrUtc)
				{
					activeRank = (*iter)->rank;
					//bool isDown = Utility::GetInstancePtr()->isDownGrade(this->_dbData->rankList, this->_dbData->scenario.airline, (*iter)->rank, rank);
					bool isDown = Utility::GetInstancePtr()->isDownRankInScenario(activeRank, rank, scenarioActiveRanks, scenarioActingRanks, rankCross);
					if ((*iter)->rank == rank || isDown)
					{
						bFoundRank = true;
					}
					/*
					else if (this->_application == ROSTER_OPTIMIZER)
					{
					if (Utility::GetInstancePtr()->isDownRankInScenario(activeRank, rank, scenarioActiveRanks, scenarioActingRanks) ||
					Utility::GetInstancePtr()->isDownGrade(this->_dbData->rankList, this->_dbData->scenario.airline, (*iter)->rank, rank))
					bFoundRank = true;
					}
					*/
				}
			}

			//vector<DBRankActing>& actingRanks = this->_dbData->rankActingList;
			if (!bFoundRank && activeRank != "NULL" && this->_application != ROSTER_OPTIMIZER)
			{
				for (vector<DBRankActing>::iterator acting_it = actingRanks.begin(); acting_it != actingRanks.end(); ++acting_it)
				{
					if ((*acting_it).airline != this->_dbData->scenario.airline)
						continue;
					if ((*acting_it).actingRank == rank && (*acting_it).activeRank == activeRank)
					{
						bFoundRank = true;
						break;
					}
				}
			}
			if (!bFoundRank)
			{
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				rosterid = Utility::GetInstancePtr()->llToa((*iter_roster)->rosterId);
				pCrew->isLegal = false;
				message = StringUtils::Format("{0:crewId}: No rank ({1:rank}) assigned in roster.", crewid, rank);
				this->setLegalityMessage((*iter_roster), pCrew, singleRule, message);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crewid;
				rv->rosterId = (*iter_roster)->rosterId;
				rv->startDTUtc = (*iter_roster)->actStrUtc;
				rv->endDTUtc = (*iter_roster)->actEndUtc;
				rv->pairingId = (*iter_roster)->pairId;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("type", rank));
				rv->operation_result.insert(pair<string, string>("label", (*iter_roster)->label));
				rv->operation_result.insert(pair<string, string>("strType", strType));
				this->addRuleViolations(rv, singleRule);
				/*if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}*/
			}
		}

		if (strType == "FLEET")
		{
			for (std::size_t i = 0; i < (*iter_roster)->pairing->getNumDuties(); i++)
			{
				Duty * duty = (*iter_roster)->pairing->getDuty(i);
				Duty::DUTY_TYPE dt = duty->getType();
				if (dt != Duty::DUTY_FLY && dt != Duty::DUTY_PURE_OPR && dt != Duty::MAX_DUTY_PLC_TYPES&&dt != Duty::DUTY_POS_OWN)
					continue;

				for (std::size_t j = 0; j < duty->getNumSegments(); j++)
				{
					Segment * seg = duty->getSegment(j);
					/*if (!seg->getIsOperating())
						continue;*/
					if (seg->getIsDeadhead() || seg->getIsTrainFerry() || seg->getIsBusFerry() || seg->getAssignment() == "DHD" ||
						seg->getAssignment() == "TVL" || seg->getAssignment() == "TRAIN" || seg->getAssignment() == "BUS" || seg->getAssignment() == "PNC")
						continue;
					time_t seg_start = seg->getStartTimeUtcAct();
					time_t seg_end = seg->getEndTimeUtcAct();
					string segfleet = seg->getFleetCD();
					bFoundFleet = false;
					for (vector<SharedPtr<CREW_FLEET>>::iterator iter = fleets.begin(); iter != fleets.end(); ++iter)
					{
						if ((*iter)->fleet == segfleet){
							if ((*iter)->expUtc < 0 || (*iter)->expUtc == NULL)
							{
								expTime = time(NULL) + 2 * 365 * 24 * 60 * 60;
							}
							else
								expTime = (*iter)->expUtc;
							expTime += lGrace;
							if (((*iter)->effUtc <= seg_start) && expTime > seg_end)
								bFoundFleet = true;

						}
					}

					if (!bFoundFleet)
					{
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}
						rosterid = Utility::GetInstancePtr()->llToa((*iter_roster)->rosterId);
						pCrew->isLegal = false;
						message = StringUtils::Format("{0:crewId}: No fleet ({1:segfleet}) assigned in roster.", crewid, segfleet);
						this->setLegalityMessage((*iter_roster), pCrew, singleRule, message);
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crewid;
						rv->rosterId = (*iter_roster)->rosterId;
						rv->startDTUtc = (*iter_roster)->actStrUtc;
						rv->endDTUtc = (*iter_roster)->actEndUtc;
						rv->pairingId = (*iter_roster)->pairId;
						rv->violation_msg = message;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("Type", segfleet));
						rv->operation_result.insert(pair<string, string>("label", (*iter_roster)->label));
						rv->operation_result.insert(pair<string, string>("strType", strType));
						this->addRuleViolations(rv, singleRule);
						/*if (this->GetApplication() == ROSTER_OPTIMIZER){
							return false;
						}*/
					}
				}
			}
		}

		if (strType == "STATUS" && !crew->statusList.empty())
		{
			time_t rosterStartUtc = (*iter_roster)->actStrUtc;
			time_t rosterEndUtc = (*iter_roster)->actEndUtc;
			time_t INVALID_TIME = utcStrToUtc("9999-12-31");
			bool valid = false;
			for (size_t i = 0; i < crew->statusList.size(); i++) {
				time_t effDt = crew->statusList[i]->effDt;
				time_t expdt = crew->statusList[i]->expdt;
				time_t effUtc = (effDt == INVALID_TIME) ? INT_MIN : effDt;
				time_t expUtc = (expdt == INVALID_TIME) ? INT_MAX : expdt;
				if ((rosterStartUtc >= effUtc && rosterStartUtc < expUtc) && (rosterEndUtc >= effUtc && rosterEndUtc < expUtc)) {
					valid = true;
					break;
				}
			}
			if (!valid) {
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				rosterid = Utility::GetInstancePtr()->llToa((*iter_roster)->rosterId);
				pCrew->isLegal = false;
				std::string message =  "The crew has invalid rosters from {0:rosterStartTime} to {1:rosterEndTime}.";
				message = StringUtils::Format(message,
					TimeUtils::Format((*iter_roster)->actStrLoc, "yyyy-mm-dd HH:mm"),
					TimeUtils::Format((*iter_roster)->actEndLoc, "yyyy-mm-dd HH:mm"));
				this->setLegalityMessage((*iter_roster), pCrew, singleRule, message);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crewid;
				rv->rosterId = (*iter_roster)->rosterId;
				rv->startDTUtc = (*iter_roster)->actStrUtc;
				rv->endDTUtc = (*iter_roster)->actEndUtc;
				rv->pairingId = (*iter_roster)->pairId;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("rosterStartTimeLoc", TimeUtils::Format((*iter_roster)->actStrLoc, "yyyy-mm-dd HH:mm")));
				rv->operation_result.insert(pair<string, string>("rosterEndTimeLoc", TimeUtils::Format((*iter_roster)->actEndLoc, "yyyy-mm-dd HH:mm")));
				rv->operation_result.insert(pair<string, string>("rosterStartTimeUtc", TimeUtils::Format((*iter_roster)->actStrUtc, "yyyy-mm-dd HH:mm")));
				rv->operation_result.insert(pair<string, string>("rosterEndTimeUtc", TimeUtils::Format((*iter_roster)->actEndUtc, "yyyy-mm-dd HH:mm")));
				rv->operation_result.insert(pair<string, string>("label", (*iter_roster)->label));
				rv->operation_result.insert(pair<string, string>("strType", strType));
				this->addRuleViolations(rv, singleRule);
			}
		}


		if (strType == "STATUS" && crew->statusList.empty()) //临时兼容crew status沒有配置的情況，后续需要删除
		{
			time_t retireLoc = crew->retireUtc; //员工退休时间
			time_t termLoc = crew->termUtc; //员工离职时间
			time_t emplLoc = crew->emplUtc; //员工入职时间

			time_t rosterStartLoc = (*iter_roster)->actStrLoc;
			time_t checkRosterLoc = rosterStartLoc - cache->lGrace;
			if ((retireLoc > 0 && retireLoc < checkRosterLoc) || (termLoc > 0  && termLoc < checkRosterLoc)) {
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
				rosterid = Utility::GetInstancePtr()->llToa((*iter_roster)->rosterId);
				pCrew->isLegal = false;
				stringstream ss;
				ss << "The crew has invalid rosters after the termination"
					<< (termLoc <= 0 ? "" : "({0:termLoc})")
					<< " or retirement date"
					<< (retireLoc <= 0 ? "" : "({1:retireLoc})")
					<< ".";
				message = StringUtils::Format(ss.str(),
					termLoc <= 0 ? "" : utcToUtcDtString(termLoc, "yyyymmdd"), 
					retireLoc <= 0 ? "" : utcToUtcDtString(retireLoc, "yyyymmdd"));
				this->setLegalityMessage((*iter_roster), pCrew, singleRule, message);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crewid;
				rv->rosterId = (*iter_roster)->rosterId;
				rv->startDTUtc = (*iter_roster)->actStrUtc;
				rv->endDTUtc = (*iter_roster)->actEndUtc;
				rv->pairingId = (*iter_roster)->pairId;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("retireLoc", retireLoc <= 0 ? "" : utcToUtcDtString(retireLoc)));
				rv->operation_result.insert(pair<string, string>("termLoc", termLoc <= 0 ? "" : utcToUtcDtString(termLoc)));
				rv->operation_result.insert(pair<string, string>("label", (*iter_roster)->label));
				rv->operation_result.insert(pair<string, string>("strType", strType));
				this->addRuleViolations(rv, singleRule);

			}

			checkRosterLoc = rosterStartLoc + cache->lGrace;
			if (emplLoc > checkRosterLoc) {
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}

				rosterid = Utility::GetInstancePtr()->llToa((*iter_roster)->rosterId);
				pCrew->isLegal = false;
				message = "The crew has invalid rosters before the employment date({0:emplLoc})";
				message = StringUtils::Format(message, utcToUtcDtString(emplLoc, "yyyymmdd"));
				this->setLegalityMessage((*iter_roster), pCrew, singleRule, message);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crewid;
				rv->rosterId = (*iter_roster)->rosterId;
				rv->startDTUtc = (*iter_roster)->actStrUtc;
				rv->endDTUtc = (*iter_roster)->actEndUtc;
				rv->pairingId = (*iter_roster)->pairId;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("emplLoc", utcToUtcDtString(emplLoc)));
				rv->operation_result.insert(pair<string, string>("label", (*iter_roster)->label));
				rv->operation_result.insert(pair<string, string>("strType", strType));
				this->addRuleViolations(rv, singleRule);
			}
		}
	}


	/*
	if (strType == "FLEET" && !bFoundFleet)
		bReturn = false;

	if (strType == "RANK" && !bFoundRank)
		bReturn = false;

	if (strType == "BASE" && !bFoundBase)
		bReturn = false;
	*/

	return bReturn;
}

//8005
bool LegalityChecker::checkLocationContinuity(RULE_LEGALITY * pCrew, const DBRule* singleRule) {
	bool bReturn = true;
	int iPrevRoster = -1;

	//rule param每行一份组，合并到一个 cache中每次检查全部 group
	rule8005 * cache = (rule8005*)singleRule->parsedParam.get();
	if (cache == NULL) {
		return true;
	}

	SharedPtr<CREW>& crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	//matnis#2397, crew.rosterList不足2个时不检查
	if (rosters.size() < 2) {
		return true;
	}

	//从[0] ~ [n-2]分别与各自后续roster两两对比
	// mantis#5340, 修改為0到n-1, 把符合excludeAssignmentGroups的任務排除後, 和前一個roster兩兩對比
	for (int i = 0; i < (int)rosters.size(); i++) {
		if (cache->excludeAssignmentGroups.size() > 0)
		{
			bool isQualMatch = false;
			if (cache->excludeAssignmentQuals.size() > 0)
			{
				if (cache->excludeAssignmentQuals[0] == "*" || std::find(cache->excludeAssignmentQuals.begin(), cache->excludeAssignmentQuals.end(), rosters[i]->qualifier) != cache->excludeAssignmentQuals.end())
				{
					isQualMatch = true;
				}
			}
			if (isQualMatch && std::find(cache->excludeAssignmentGroups.begin(), cache->excludeAssignmentGroups.end(), rosters[i]->duty) != cache->excludeAssignmentGroups.end())
			{
				continue;
			}
		}
		if (iPrevRoster >= 0) {
			SharedPtr<ROSTER>& current = rosters[iPrevRoster];
			SharedPtr<ROSTER>& next = rosters[i];
			string currentEndAirport = current->location;
			string nextStartAirport = next->location;
			if (current->pairing && current->pairing->getNumDuties() > 0) {
				Duty * lastDuty = current->pairing->getDuty(current->pairing->getNumDuties() - 1);
				currentEndAirport = lastDuty->getArrStation();
			}
			if (next->pairing && next->pairing->getNumDuties() > 0) {
				Duty * firstDuty = next->pairing->getDuty(0);
				nextStartAirport = firstDuty->getDepStation();
			}

			//前后不一致，确认是否属于 no warning pair
			if (currentEndAirport != nextStartAirport) {
				bool isNoWarningPair = false;
				auto range = cache->noWarningAirportPairs.equal_range(currentEndAirport);
				for (auto i = range.first; i != range.second; ++i) {
					if (i->second == nextStartAirport) {
						isNoWarningPair = true; break;
					}
				}
				//不属于 no warning pair, 提示警告
				if (!isNoWarningPair) {

					//mantis#2523, 若违规时间段内没有RO创建的roster 则不做警告, 避免PA违规无法分配任务
					if (this->_application == ROSTER_OPTIMIZER)
					{
						if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, current->actStrUtc, next->actEndUtc))){
							iPrevRoster = i;
							continue;
						}
					}

					pCrew->isLegal = false;
					stringstream ss;
					ss << "On " << utcToUtcDtString(next->strLoc) << " the duty " << next->label << " start at " << nextStartAirport << ", but the crew is currently in " << currentEndAirport;
					string msg = ss.str();
					this->setLegalityMessage(next, pCrew, singleRule, msg);
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = crew->idCrew;
					rv->rosterId = next->rosterId;
					rv->startDTUtc = next->actStrUtc;
					rv->endDTUtc = next->actEndUtc;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("strLoc", utcToUtcDtString(next->strLoc)));
					rv->operation_result.insert(pair<string, string>("label", next->label));
					rv->operation_result.insert(pair<string, string>("nextStartAirport", nextStartAirport));
					rv->operation_result.insert(pair<string, string>("currentEndAirport", currentEndAirport));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
			}
		}
		iPrevRoster = (int)i;
	}

	return bReturn;
}

bool LegalityChecker::hasQualCombInCof(vector<SharedPtr<CrewOnFlight>> cof, string quals, time_t start, time_t end)
{
	bool hasQuals = true;

	vector<string> filterQual;

	for (vector<SharedPtr<CrewOnFlight>>::iterator it_crew = cof.begin(); it_crew != cof.end(); ++it_crew){
		vector<SharedPtr<CREW_QUALIFICATION>> quals = (*it_crew)->crew->qualificationList;
		for (vector<SharedPtr<CREW_QUALIFICATION>>::iterator iter = quals.begin(); iter != quals.end(); iter++){
			if ((*iter)->expiryUtc < 0 || (*iter)->expiryUtc == NULL)
				(*iter)->expiryUtc = time(NULL) + 2 * 365 * 24 * 60 * 60;
			if (((*iter)->issuedUtc<start) &&
				((*iter)->expiryUtc>end)
				)
				filterQual.push_back((*iter)->qual);
		}
	}

	//compare quals and filterQual
	vector<string> vQualsChecked;
	split(quals, '|', vQualsChecked);
//	boost::split(vQualsChecked, quals, boost::is_any_of("|"), boost::token_compress_on);

	if (vQualsChecked.size() == 0 || cof.size() == 0)
		return false;

	for (vector<string>::iterator it_qual = vQualsChecked.begin(); it_qual != vQualsChecked.end(); ++it_qual){
		//只要一次找不到，则说明该COF没有quals的资质组合
		if (find(filterQual.begin(), filterQual.end(), (*it_qual)) == filterQual.end())
		{
			return false;
		}
	}

	return hasQuals;
}




bool LegalityChecker::checkBasicCompetencyByPairing(SharedPtr<CREW> crew, Pairing* pairing, string actingRank, const DBRule* singleRule)
{

	bool bReturn = true;
	string crewid = crew->idCrew;

	//mantis#2184, 8004, rule-param cache
	rule8004 * cache = (rule8004*)singleRule->parsedParam.get();
	string strBase = cache->strBase;
	string strRank = cache->strRank;
	string strFleet = cache->strFleet;
	string strType = cache->strType;
	string strUnit = cache->strUnit;
	bool isEnabled = cache->isEnable;
	int iGracePeriod = cache->iGracePeriod;
	long lGrace = cache->lGrace;
	transform(strType.begin(), strType.end(), strType.begin(), ::toupper);
	if (!isEnabled)
		return true;

	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;
	vector<DBRankActing>& actingRanks = this->_dbData->rankActingList;

	time_t lCheckedStart = this->_dbData->scenario.startDtUTC;
	time_t lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	long long expTime = 0;

	vector<string>& scenarioActingRanks = this->_dbData->scenario.actingRanks;
	vector<string>& scenarioActiveRanks = this->_dbData->scenario.ranks;
	string rankCross = this->_dbData->scenario.rankCross;

	//string fleet;
	time_t roster_start = pairing->getStartTimeUtc();
	//long roster_end = pairing->getEndTimeIncludingRestUtc();
	time_t roster_end = pairing->getEndTimeUtc();
	string rank = actingRank;
	string base = pairing->getBase();

	bool bFoundBase = false, bFoundRank = false, bFoundFleet = false;
	//-------------- base ---------------
	if (strType == "BASE")
	{
		for (vector<SharedPtr<CREW_BASE>>::iterator iter = bases.begin(); iter != bases.end(); ++iter)
		{
			if ((*iter)->base == base)
			{
				if ((*iter)->expUtc < 0 || (*iter)->expUtc == NULL)
				{
					expTime = time(NULL) + 2 * 365 * 24 * 60 * 60;
				}
				else
					expTime = (*iter)->expUtc;
				expTime += lGrace;
				if (((*iter)->effUtc <= roster_start) && expTime > roster_end)
					bFoundBase = true;
			}
		}

		if (!bFoundBase)
		{
			return false;
		}
	}

	//-------------- rank ---------------
	if (strType == "RANK")
	{
		string activeRank = "NULL";
		for (vector<SharedPtr<CREW_RANK>>::iterator iter = ranks.begin(); iter != ranks.end(); ++iter)
		{
			if ((*iter)->expUtc < 0 || (*iter)->expUtc == NULL)
			{
				expTime = time(NULL) + 2 * 365 * 24 * 60 * 60;
			}
			else
				expTime = (*iter)->expUtc;
			expTime += lGrace;
			//mantis#1716, 按roster_start是否在 crew_rank时间段内判断
			//if ((*iter)->effUtc < roster_start && expTime>roster_end)
			//0001935: 8004 任务环开始应该在级别生效之后，任务环结束应该在级别失效之前
			//change it back by 1935
			if ((*iter)->effUtc <= roster_start && expTime > roster_end)
			{
				activeRank = (*iter)->rank;
				bool isDown = Utility::GetInstancePtr()->isDownRankInScenario(activeRank, rank, scenarioActiveRanks, scenarioActingRanks, rankCross);
				if ((*iter)->rank == rank || isDown)
				{
					bFoundRank = true;
				}
			}
		}

		if (!bFoundRank && activeRank != "NULL" && this->_application != ROSTER_OPTIMIZER)
		{
			for (vector<DBRankActing>::iterator acting_it = actingRanks.begin(); acting_it != actingRanks.end(); ++acting_it)
			{
				if ((*acting_it).airline != this->_dbData->scenario.airline)
					continue;
				if ((*acting_it).actingRank == rank && (*acting_it).activeRank == activeRank)
				{
					bFoundRank = true;
					break;
				}
			}
		}
		if (!bFoundRank)
		{
			return false;
		}
	}

	//-------------- fleet ---------------
	if (strType == "FLEET")
	{
		for (std::size_t i = 0; i < pairing->getNumDuties(); i++)
		{
			Duty * duty = pairing->getDuty(i);
			Duty::DUTY_TYPE dt = duty->getType();
			
			if (dt != Duty::DUTY_FLY && dt != Duty::DUTY_PURE_OPR && dt != Duty::MAX_DUTY_PLC_TYPES&&dt != Duty::DUTY_POS_OWN)
			{
				continue;
			}
				
			for (std::size_t j = 0; j < duty->getNumSegments(); j++)
			{
				Segment * seg = duty->getSegment(j);
				if (seg->getIsDeadhead() || seg->getIsTrainFerry() || seg->getIsBusFerry() || seg->getAssignment()=="DHD"||
					seg->getAssignment() == "TVL" || seg->getAssignment() == "TRAIN" || seg->getAssignment() == "BUS" || seg->getAssignment() == "PNC")
					continue;
				/*if (!seg->getIsOperating())
					continue;*/
				time_t seg_start = seg->getStartTimeUtcAct();
				time_t seg_end = seg->getEndTimeUtcAct();
				string segfleet = seg->getFleetCD();
				bFoundFleet = false;
				for (vector<SharedPtr<CREW_FLEET>>::iterator iter = fleets.begin(); iter != fleets.end(); ++iter)
				{
					if ((*iter)->fleet == segfleet){
						if ((*iter)->expUtc < 0 || (*iter)->expUtc == NULL)
						{
							expTime = time(NULL) + 2 * 365 * 24 * 60 * 60;
						}
						else
							expTime = (*iter)->expUtc;
						expTime += lGrace;
						if (((*iter)->effUtc <= seg_start) && expTime > seg_end)
							bFoundFleet = true;

					}
				}

				if (!bFoundFleet)
				{
					return false;
				}
			}
		}
	}

	//-------------- status ---------------
	if (strType == "STATUS" && !crew->statusList.empty())
	{
		time_t rosterStartUtc = roster_start;
		time_t rosterEndUtc = roster_end;
		time_t INVALID_TIME = utcStrToUtc("9999-12-31");
		bool valid = false;
		for (size_t i = 0; i < crew->statusList.size(); i++) {
			time_t effDt = crew->statusList[i]->effDt;
			time_t expdt = crew->statusList[i]->expdt;
			time_t effUtc = (effDt == INVALID_TIME) ? INT_MIN : effDt;
			time_t expUtc = (expdt == INVALID_TIME) ? INT_MAX : expdt;
			if ((effUtc >= rosterStartUtc && effUtc <= rosterEndUtc) && (expUtc >= rosterStartUtc && expUtc <= rosterEndUtc)) {
				valid = true;
				break;
			}
		}
		if (!valid) {
			bReturn = false;
		}
	}

	if (strType == "STATUS" && crew->statusList.empty()) //临时兼容crew status沒有配置的情況，后续需要删除
	{
		time_t retireLoc = crew->retireUtc; //员工退休时间
		time_t termLoc = crew->termUtc; //员工离职时间
		time_t emplLoc = crew->emplUtc; //员工入职时间

		time_t rosterStartLoc = pairing->getStartTime();
		time_t checkRosterLoc = rosterStartLoc - cache->lGrace;
		if ((retireLoc > 0 && retireLoc < checkRosterLoc) || (termLoc > 0 && termLoc < checkRosterLoc)) {
			bReturn = false;

		}

		checkRosterLoc = rosterStartLoc + cache->lGrace;
		if (emplLoc > checkRosterLoc) {
			bReturn = false;
		}
	}

	if (strType == "FLEET" && !bFoundFleet)
		bReturn = false;

	if (strType == "RANK" && !bFoundRank)
		bReturn = false;

	if (strType == "BASE" && !bFoundBase)
		bReturn = false;

	return bReturn;
}

/*
8014
根据DUTY GROUP和RANK,FLEET检查ROSTER需要的资质
RANK,FLEET,QUAL,ASSIGNMENT GROUP,ALERT BUFFER,ALERT UNIT
*,	*,		SEP,FLY,			30,				D
*/
bool LegalityChecker::checkGroupReqQualByPairing(SharedPtr<CREW> crew, Pairing* pairing, string actingRank, const DBRule* singleRule)
{
	bool bReturn = true;

	if (singleRule->params.size() == 0)
		return bReturn;

	string header, headeValue;
	string strDefinition, strValue;
	rule8014* ruleParam = (rule8014*)singleRule->parsedParam.get();
	int iBuffer = ruleParam->iBuffer;
	string rAtiveRank = ruleParam->rActiveRanks;
	string rQual = ruleParam->rQual;
	string rDutyGroup = ruleParam->rDutyGroup;
	string rAlertUnit = ruleParam->rAlertUnit;
	string rAlertBuffer = ruleParam->rAlertBuffer;
	string rRank = ruleParam->rRank;
	string rFleet = ruleParam->rFleet;
	string rQualFleets = ruleParam->rQualFleets;
	string rQualFleetsGroup = ruleParam->rQualFleetsGroup;
	string rCrewFleets = ruleParam->rCrewFleets;
	string rExcludeRoles = ruleParam->rExcludeRoles;
	string rExcludeSubRoles = ruleParam->rExcludeSubRoles;
	vector<string>& qualifications = ruleParam->qualifications;
	vector<string>& fleets = ruleParam->fleets;
	vector<string>& assignmentGroups = ruleParam->assignmentGroups;
	vector<string>& actingRanks = ruleParam->actingRanks;
	vector<string>& qualFleets = ruleParam->qualFleets;
	vector<string>& qualFleetsGroups = ruleParam->qualFleetsGroups;
	vector<string>& crewFleets = ruleParam->crewFleets;
	vector<string>& segTypes = ruleParam->segTypes;
	vector<string>& excludeRoles = ruleParam->excludeRoles;
	vector<string>& excludeSubRoles = ruleParam->excludeSubRoles;
	//本接口属于PO调用，假设该阶段没有TAIL NUMBER，无需检查REGISTERS参数相关逻辑

	vector<SharedPtr<CREW_QUALIFICATION>>&  quals = crew->qualificationList;
	string sDutyGroup;

	time_t lCheckedStart = pairing->getStartTimeUtc(), lCheckedEnd = pairing->getEndTimeUtc();

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, "*", rAtiveRank, "*", "*","*", lCheckedStart, lCheckedEnd))
		return true;

	//boost::split(assignmentGroups, rDutyGroup, boost::is_any_of("|"), boost::token_compress_on);
	//vector<SharedPtr<DBRule_8014>> asnGroup = this->_dbData->rule_8014;
	//mantis#1705, 优化8014
	vector<string>& vDutyGroup = this->_dbData->getRule8014AssignmentsByGrps(rDutyGroup);
	vector<string>::iterator isDutyGroupMatched;

	//if (rRank != "*" && rRank != actingRank)
	if (rRank != "*" && std::find(actingRanks.begin(), actingRanks.end(), actingRank) == actingRanks.end())
		return true;

	auto qualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(crew, this->_dbData->qualExtensionConfigMap);
	//vector<Duty*> duties = pairing->getDutyVec();
	//for (vector<Duty*>::iterator it_duty = duties.begin(); it_duty != duties.end(); ++it_duty)
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++)
	{
		Duty * duty = pairing->getDuty(i);
		//vector<Segment*> segments = duty->getSegments();
		//for (vector<Segment*>::iterator it_seg = segments.begin(); it_seg != segments.end(); ++it_seg)
		for (std::size_t j = 0; j < duty->getNumSegments(); j++)
		{
			Segment * segment = duty->getSegment(j);
			if (rFleet == "*")
				isDutyGroupMatched = std::find(vDutyGroup.begin(), vDutyGroup.end(), pairing->getPrimeActivity());
			else
				isDutyGroupMatched = std::find(vDutyGroup.begin(), vDutyGroup.end(), segment->getAssignment());
		
			if (segTypes[0] != "*" && find(segTypes.begin(), segTypes.end(), segment->getDomIntType()) == segTypes.end()){
				continue;
			}

			const auto& rosterFlight = this->_dbData->rosterFlightMgr.get(segment->getDBId(), crew->idCrew);
			if (rosterFlight) {
				if (rExcludeRoles != "*" && !rExcludeRoles.empty()) {
					if (find(excludeRoles.begin(), excludeRoles.end(), rosterFlight->tmRole) != excludeRoles.end())
						continue;
				}

				if (rExcludeSubRoles != "*" && !rExcludeSubRoles.empty()) {
					if (find(excludeSubRoles.begin(), excludeSubRoles.end(), rosterFlight->tmSubRole) != excludeSubRoles.end())
						continue;
				}
			}
			if (rCrewFleets != "*" && !Utility::GetInstancePtr()->isCrewFleetQualified(crew, crewFleets, segment->getStartTimeUtcAct(), segment->getEndTimeUtcAct())) {
				continue;
			}
			

			//if (rFleet == "*" || rFleet == (*it_seg)->getFleetCD())
			if ((rFleet == "*") || (std::find(fleets.begin(), fleets.end(), segment->getFleetCD()) != fleets.end()))
			{
				if (rDutyGroup == "*" || isDutyGroupMatched != vDutyGroup.end())
				{
					bool bHasQual = false;
					long long lBuffer = -1;
					bool hasQualFleetFilter = (rQualFleets != "*" || rQualFleetsGroup != "*");
					if (rQual == "*" && !hasQualFleetFilter)
						bHasQual = true;
					else
					{
						for (vector<SharedPtr<CREW_QUALIFICATION>>::iterator it_qual = quals.begin(); it_qual != quals.end(); ++it_qual)
						{
							if (rQual != "*" && std::find(qualifications.begin(), qualifications.end(), (*it_qual)->qual) == qualifications.end())
							{
								continue;
							}

							time_t issuedUtc = (*it_qual)->issuedUtc;
							time_t expiredUtc = (*it_qual)->expiryUtc;
							if (expiredUtc <= 0)
							{
								expiredUtc = time(NULL) + 365 * 24 * 60 * 60;
							}
							if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
								auto qualPeriod = RosterUtils::GetQualExtension(*it_qual, qualExtensionConfigsForQualMap);
								issuedUtc = std::get<0>(qualPeriod);
								expiredUtc = std::get<1>(qualPeriod);
							}
							if (rAlertUnit == "D")
								lBuffer = stoi(rAlertBuffer)* 24 * 60 * 60;
							if (issuedUtc < segment->getStartTimeUtcAct() && expiredUtc - lBuffer > segment->getEndTimeUtcAct()) {
								if (rQualFleets != "*" && std::find(qualFleets.begin(), qualFleets.end(), (*it_qual)->fleetGrp) == qualFleets.end()) {
									continue;
								}
								if (rQualFleetsGroup != "*"
									&& std::find(qualFleetsGroups.begin(), qualFleetsGroups.end(), (*it_qual)->fleetGrp) == qualFleetsGroups.end()
									&& std::find(qualFleetsGroups.begin(), qualFleetsGroups.end(), (*it_qual)->acType) == qualFleetsGroups.end()) {
									continue;
								}
								bHasQual = true;
								break;
							}
						}
					}
					if (!bHasQual)
					{
						return false;
					}
				}
			}
		}
	}

	return bReturn;
}






/*
Block:
MAX_LIMIT,PERIOD,PRD_DESC,USEPRORATED,CHECK_LAST_DAY
40		 , 7	,CD		 ,N			 ,0

FDP:
MAX_LIMIT,PERIOD,PRD_DESC,USEPRORATED,CHECK_LAST_DAY
70,7,RD,N,0
//这里需要考虑RO情形（没有Man day数据，需要根据新ASSIGNMENT计算Man Day）
*/
bool LegalityChecker::checkMaxCummulative2(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkMaxCummulative2");

	bool isValid = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strMax, strPrdDesc, strProrated, strLastDay = "0", strPeriod;
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	//max_limit,period,PRD_DESC,useProrated,check_last_day
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//transform(header.begin(), header.end(), header.begin(), ::toupper);
		//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "MAX_LIMIT") {
			strMax = headeValue;
		}

		if (header == "PERIOD") {
			strPeriod = headeValue;
		}
		if (header == "PRD_DESC") {
			strPrdDesc = headeValue;
		}
		if (header == "USEPRORATED") {
			strProrated = headeValue;
		}
		if (header == "CHECK_LAST_DAY") {
			strLastDay = headeValue;
		}

	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	int iMax = 0;
	string::size_type position = strMax.find(":");
	if (position != strMax.npos) {
		try
		{
			iMax = stoi(strMax.substr(0, position)) * 60 + stoi(strMax.substr(position + 1));
		}
		catch(...)
		{
			iMax = 99999;
		}

	}
	else{

		try
		{
			iMax = stoi(strMax);
			iMax = iMax * 60;
		}
		catch(...)
		{
			iMax = 999999;
		}
	}

	map<time_t, time_t>::iterator iter_date;
	map<time_t, time_t> mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(strPrdDesc, strPeriod, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600, weekdayStartFrom);

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };

	vector<SharedPtr<CREW_MANDAY_FD>>& cfd = crew->mandayFdList;
	vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;
	vector<SharedPtr<CREW_BASE>>&  bases = crew->baseList;
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	if (ranks.size() < 1)
		return true;

	bool isFd = (crew->division == "P");

	string base;
	for (vector<SharedPtr<CREW_BASE>>::iterator it = bases.begin(); it != bases.end(); it++)
	{
		if ((*it)->isPrime)
		{
			base = (*it)->base;
		}
	}
	if (base == "") base = "TPE";
	auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	if (isFd)
		stable_sort(cfd.begin(), cfd.end(), cmpFD);
	else
		stable_sort(cabin.begin(), cabin.end(), cmpCC);
	for (iter_date = mpRange.begin(); iter_date != mpRange.end(); iter_date++)
	{
		double iCumFDP = 0, iCumBlh = 0, iCumDP = 0;
		if (isFd)
		{
			for (size_t j = 0; j < cfd.size(); j++)
			{
				if (cfd[j]->crewDateUtc >= (iter_date->first - iOffsetMinutes * 60) && cfd[j]->crewDateUtc <= iter_date->second)
				{
					iCumFDP += cfd[j]->fdp;
					iCumBlh += cfd[j]->blh;
					iCumDP += cfd[j]->dp;
				}
			}
		}
		else
		{
			for (size_t j = 0; j < cabin.size(); j++)
			{
				if (cabin[j]->crewDateUtc >= (iter_date->first - iOffsetMinutes * 60) && cabin[j]->crewDateUtc <= iter_date->second)
				{
					iCumFDP += cabin[j]->fdp;
					iCumBlh += cabin[j]->blh;
					iCumDP += cabin[j]->dp;
				}
			}
		}

		utcToLocalDtStr(iter_date->first + iOffsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
		utcToLocalDtStr(iter_date->second + iOffsetMinutes * 60 - 1, endUtcStr, sizeof(endUtcStr));
		if (singleRule->function == RULES::MAX_CUM_BLOCK2)
		{
			if ((int)iCumBlh > iMax)
			{
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);
				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative block hours exceed the maximum {2:strMax}.";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, strMax);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);
				pCrew->isLegal = false;

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}

			}
		}

		if (singleRule->function == RULES::MAX_CUM_DP2)
		{
			if ((int)iCumDP > iMax)
			{
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);

				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative duty period exceed the maximum {2:strMax}.";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, strMax);

				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);
				pCrew->isLegal = false;

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}

			}
		}

		if (singleRule->function == RULES::MAX_CUM_FDP2)
		{
			if ((int)iCumFDP > iMax)
			{
				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);
				string message = "From {0:startUtcStr} To {1:endUtcStr} the actual cumulative flight duty period exceed the maximum {2:strMax}.";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, strMax);
				SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
				this->setLegalityMessage(ppCrew, pCrew, singleRule, message);
				pCrew->isLegal = false;

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->startDTUtc = iter_date->first;
				rv->endDTUtc = iter_date->second;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}

			}
		}
	}
	return isValid;
}

//8015
bool LegalityChecker::checkULRRest(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkULRRest");

	bool bReturn = true;

	//ULR is a duty or roster
	bool bULRIsRoster = true;

	rule8015 * cache = (rule8015*)singleRule->parsedParam.get();
	//table2：REST TYPE,MIN REST LENGTH,MIN CALENDAR DAYS,MIN LOCAL NIGHTS,LOCATION
	string strRestType = cache->strRestType;
	string strMinRest = cache->strMinRest;
	string strMinCalDays = cache->strMinCalDays;
	string strMinLocalNights = cache->strMinLocalNights;
	string strLocationBase = cache->strLocationBase;
	string strExceptionCode = cache->exceptionCode;
	vector<string> exceptionCodeList = cache->exceptionCodeList;
	vector<string> exceptionAssignmentGroups = cache->exceptionAssignmentGroups;
	//table1： definition parameters
	//string strMaxSector = cache->strMaxSector;   //20180112 ain: 新增8015 Max Sector
	//string strMinFlightTime = cache->strMinFlightTime; //20180112 ain: 新增8015 Min Flight Time
	//string strMinFDP = cache->strMinFDP; //20180112 ain: 新增8015 Min FDP
	//string strQualifier = cache->strStandbys;
	//int iMaxSector = cache->iMaxSector;//20180112 ain: 新增8015 Min FDP

	//string strLabel = cache->strLabels; 

	//vector<string> strLabels, strQualifiers;
	//split(strLabel, '|', strLabels);
	//split(strQualifier, '|', strQualifiers);
	vector<DBRule> rules = this->_dbData->getRuleFunctions(RULES::ULR_REST_CHECK);
	stable_sort(rules.begin(), rules.end(), block_cmp);
	map<string, string>::const_iterator iter;
	string header, headeValue;
	for (auto& rule : rules)
	{
		if (rule.tableNum == 2)
			continue;
		map<string, string> parameter = rule.params;

		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "EXCEPTION CODE") {
				strExceptionCode = headeValue;
				split(strExceptionCode, '|', exceptionCodeList);
				break;
			}
		}
		break;
	}
	int iMinRest = cache->iMinRest;
	int iRequiredCalDays = cache->iRequiredCalDays;
	int iLocalsRequired = cache->iMinLocalNights;
	int iNights = cache->iMinLocalNights;
	transform(strRestType.begin(), strRestType.end(), strRestType.begin(), ::toupper);
	//definition rules
	if (strRestType.length() < 1)
		return true;
	Local_Night_Definition local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	if (local_night.LocalEnd.empty() && local_night.LocalStart.empty())
	{
		Logger::getRuleLogger()->error("Exception::No local night definition rules (rule 2014).");
		return true;
	}
	int localNightStart = TimeUtils::hhmmToMinutes(local_night.LocalStart);
	int localNightEnd = TimeUtils::hhmmToMinutes(local_night.LocalEnd);
	int localNightInterval = TimeUtils::hhmmToMinutes(local_night.MinRestInterval);

	string base = this->_dbData->crewList[pCrew->crewIndex]->baseList.at(0)->base;
	//OP1489
	int offsetMinutes = 0;
	if (this->_dbData->scenario.airline != "BR")
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	else
		offsetMinutes = this->_dbData->getAirportOffsetMinutes("TPE");
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	string restBase = "*";
	if (strLocationBase == "CREW BASE") {
		restBase = base;
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	}
	
	if ((strRestType == "PRE-ULR") || (strRestType == "POST-ULR") || (strRestType == "LAYOVER"))
	{
		vector<string> exceptionAssignments;
		if (exceptionAssignmentGroups.size() > 0 && exceptionAssignmentGroups[0] != "*" && exceptionAssignmentGroups[0] != "") {
			for (const auto& group : exceptionAssignmentGroups) {
				const auto& list = this->_dbData->getAssignmentsInGroup(group);
				exceptionAssignments.insert(exceptionAssignments.end(), list.begin(), list.end());
			}
		}
		if (strRestType == "LAYOVER") {
			bULRIsRoster = false;
		}
		
		for (auto it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
		{
			//0002738: 8015新增LABEL欄位
			/*
			string label = (*it_roster)->label;
			string qualifier = (*it_roster)->qualifier;
			if (
			!
			(
			(
			(strLabel == "*") ||
			(strLabel != "*" && find(strLabels.begin(), strLabels.end(), label) != strLabels.end())
			)
			||
			(
			(strQualifier == "*") ||
			(strQualifier != "*" && find(strQualifiers.begin(), strQualifiers.end(), qualifier) != strQualifiers.end())
			)
			)
			)
			continue;
			*/
			if (strLocationBase == "PTN BASE")
			{
				restBase = (*it_roster)->location;
				offsetMinutes = this->_dbData->getAirportOffsetMinutes(restBase);
			}
			if ((*it_roster)->pairing)
			{
				// check exception code
				if (strExceptionCode != "" && strExceptionCode != "*") {
					bool foundCode = false;
					for (const auto& duty : (*it_roster)->pairing->getDutyVec()) {
						for (const auto& seg : duty->getSegments()) {
							const auto& rf = this->_dbData->rosterFlightMgr.get(seg->getDBId(), (*it_roster)->idcrew);
							if (rf == nullptr)
								continue;
							if (rf->tsFlag == "" || rf->tsFlag.size() == 0)
								continue;
							if (find(exceptionCodeList.begin(), exceptionCodeList.end(), rf->tsFlag) != exceptionCodeList.end()) {
								foundCode = true;
								break;
							}
						}
						if (foundCode)
							break;
					}
					if (foundCode)
						continue;
					
				}

				int iDutyIndex = -1;
				//vector<Duty *> duties = (*it_roster)->pairing->getDutyVec();
				//for (vector<Duty*>::iterator it_duty = duties.begin(); it_duty != duties.end(); ++it_duty)
				for (std::size_t iDutyIndex = 0; iDutyIndex < (*it_roster)->pairing->getNumDuties(); iDutyIndex++)
				{
					//Duty::DUTY_TYPE dt = (*it_duty)->getType();
					//iDutyIndex++;
					Duty * duty = (*it_roster)->pairing->getDuty(iDutyIndex);
					//if (dt != Duty::DUTY_PAIRING_REST && dt != Duty::DUTY_BLANK_DAY && ((*it_duty)->isULR()))
					if (duty->isULR())
					{
						//int iNights = stoi(strMinLocalNights);
						time_t start = duty->getStartTimeUtcAct();
						time_t end = duty->getEndTimeUtcAct();
						int iMode = 0;
						time_t DayStart = 0;
						if (bULRIsRoster)
							start = (*it_roster)->actStrUtc;

						if (strLocationBase == "REST LOCATION")
						{
							restBase = duty->getDepStation();
							offsetMinutes = this->_dbData->getAirportOffsetMinutes(restBase);
						}

						if (strRestType == "PRE-ULR")
						{
							time_t anotherTime1 = start - iMinRest * 60;
							DayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offsetMinutes);
							time_t anotherTime2 = DayStart - iRequiredCalDays * 24 * 60 * 60;
							if (anotherTime1 > anotherTime2)
								anotherTime1 = anotherTime2;
							time_t otherStartTm = 0; //实际休息开始时间(用于检查Min Rest Length,Min Calendar Days参数)
							int i = -1;
							for (i = 0; i != rosters.size(); i++)
							{
								if ((rosters[i]->pairing) && rosters[i]->pairId == (*it_roster)->pairId)
								{
									break;
								}
							}
							if (i > 0)
							{
								for (int j = i - 1; j != -1; j--)
								{
									bool bRest = false;
									if (exceptionAssignmentGroups.size() > 0 && exceptionAssignmentGroups[0] != "*" && exceptionAssignmentGroups[0] != "") {
										if ((find(exceptionAssignments.begin(), exceptionAssignments.end(), rosters[j]->qualifier) != exceptionAssignments.end())) {
											bRest = true;
										}
									}

									if (!bRest && RuleParams::GetInstancePtr()->isRestAssignment(rosters[j]->qualifier, rosters[j]->duty)) {
										bRest = true;
									}

									if (bRest)
										continue;

									if ((*it_roster)->needRuleCheck == false && rosters[j]->needRuleCheck == false && this->GetApplication() == ROSTER_OPTIMIZER)
										continue;

									if (j == i - 1 && rosters[j]->duty == "RB" && rosters[j]->actRestStrUtc >= (*it_roster)->actStrUtc)
									{
										// 抓飛, 把ULR任務開始時間改成待命開始時間
										start = rosters[j]->actStrUtc;
										continue;
									}
									otherStartTm = rosters[j]->actRestStrUtc;
									break;
								}
							}
							if (!bULRIsRoster && iDutyIndex > 0)
								otherStartTm = (*it_roster)->pairing->getDuty(iDutyIndex - 1)->getEndTimeUtcAct();

							//检查有几个连续local nights。这些local nights无需在连续的REST里。
							//根据local nighs，得到REST开始结算时间的列表
							//it_roster1 = it_roster;Z
							time_t roster_start = (*it_roster)->actStrUtc;
							time_t rosterDayStart;
							rosterDayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster_start, offsetMinutes);
							time_t restStartAtMost = rosterDayStart - (iNights + 1) * 24 * 60 * 60;
							vector<Rest_Ranges*> rests = Utility::GetInstancePtr()->getRestRanges(rosters, restStartAtMost, roster_start, {}, true, "*");

							int localNights = Utility::GetInstancePtr()->hasXConsecutiveLocalNightsBeforeTm(rests, iLocalsRequired, roster_start, local_night, offsetMinutes);

							if ((localNights < iLocalsRequired) || (otherStartTm > anotherTime1))
							{
								if (this->_application == ROSTER_OPTIMIZER && (*it_roster)->source == "PA" && !((*it_roster)->needRuleCheck))
									if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, restStartAtMost, roster_start))){
										//20180123 ain, mantis#2765, mem leak
										for (auto& rest : rests) {
											delete rest;
										}
										rests.clear();
										continue;
									}
								bReturn = false;
								stringstream ss;
								ss << "The rest before the ULR roster doesn't contain " << strMinLocalNights << " consecutive local nights or is less than ";
								ss << strMinRest << " hours and " << strMinCalDays << " calendar days.";
								string msg = ss.str();
								this->setLegalityMessage((*it_roster), pCrew, singleRule, msg);
								pCrew->isLegal = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
								rv->rosterId = (*it_roster)->rosterId;
								rv->pairingId = (*it_roster)->pairId;
								rv->dutySequenceNumber = duty->getDutySegNum();
								rv->startDTUtc = restStartAtMost;
								rv->endDTUtc = roster_start;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("afterOrBefore", "before"));
								rv->operation_result.insert(pair<string, string>("strMinLocalNights", strMinLocalNights));
								rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
								rv->operation_result.insert(pair<string, string>("strMinCalDays", strMinCalDays));
								rv->violation_msg = msg;
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER)
								{
									//20180123 ain, mantis#2765, mem leak
									for (auto& rest : rests) {
										delete rest;
									}
									rests.clear();
									return false;
								}
							}

							//delete rests
							for (vector<Rest_Ranges *>::iterator it = rests.begin(); it != rests.end(); ++it)
							{
								if (NULL != *it)
								{
									delete *it;
									*it = NULL;
								}
							}
							rests.clear();

						}
						if (strRestType == "POST-ULR")
						{
							if ((*it_roster)->duty != "FLY")
								continue;

							vector<SharedPtr<ROSTER>>::iterator it_roster1 = it_roster;

							it_roster1++;

							end = (*it_roster)->actRestStrUtc;
							const time_t checkStart = end;

							time_t anotherTime1 = end + (iMinRest)* 60;
							time_t DayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes);
							int iRequiredPlusDay = 0;
							if (DayStart != end){
								// mantis#4649, 若直接把iRequiredCalDays++, 第二個ULR會出錯
								//iRequiredCalDays++;
								iRequiredPlusDay = 1;
							}
							time_t anotherTime2 = DayStart + (iRequiredCalDays + iRequiredPlusDay) * 24 * 60 * 60;
							if (anotherTime1 < anotherTime2)
								anotherTime1 = anotherTime2;

							time_t anotherTime3 = Utility::GetInstancePtr()->getRestByNumberOfLocalNights(end, iNights, local_night, offsetMinutes);
							if (anotherTime1 < anotherTime3)
								anotherTime1 = anotherTime3;

							for (; it_roster1 != rosters.end(); ++it_roster1)
							{
								bool bRest = false;
								if (exceptionAssignmentGroups.size() > 0 && exceptionAssignmentGroups[0] != "*" && exceptionAssignmentGroups[0] != "") {
									if ((find(exceptionAssignments.begin(), exceptionAssignments.end(), (*it_roster1)->qualifier) != exceptionAssignments.end())) {
										bRest = true;
									}
								}

								if (!bRest && RuleParams::GetInstancePtr()->isRestAssignment((*it_roster1)->qualifier, (*it_roster1)->duty)) {
									bRest = true;
								}
								if (bRest)
									continue;

								if ((*it_roster)->needRuleCheck == false && (*it_roster1)->needRuleCheck == false && this->_application == ROSTER_OPTIMIZER)
									continue;
								//post ULR local nights must be consecutive. Different to pre ulr
								if ((*it_roster1)->actStrUtc < anotherTime1)
								{
									bReturn = false;
									stringstream ss;
									ss << "The rest after the ULR is less than " << strMinRest << " hours inclusive " << strMinCalDays << " calendar days with " << strMinLocalNights << " local nights";
									string msg = ss.str();
									this->setLegalityMessage(duty, pCrew, singleRule, msg);
									pCrew->isLegal = false;
									RULE_VIOLATION* rv = new RULE_VIOLATION();
									rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
									rv->rosterId = (*it_roster)->rosterId;
									rv->pairingId = (*it_roster)->pairId;
									rv->dutySequenceNumber = duty->getDutySegNum();
									rv->startDTUtc = checkStart;
									rv->endDTUtc = (*it_roster1)->actStrUtc;
									rv->violation_msg = msg;
									rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
									//OP#1448提供message参数给gantt
									rv->operation_result.insert(pair<string, string>("afterOrBefore", "after"));
									rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
									rv->operation_result.insert(pair<string, string>("strMinCalDays", strMinCalDays));
									rv->operation_result.insert(pair<string, string>("strMinLocalNights", strMinLocalNights));
									this->addRuleViolations(rv, singleRule);
									if (this->GetApplication() == ROSTER_OPTIMIZER){
										return false;
									}
									//break at next work duty
									break;
								}

							}
						}
						if (strRestType == "LAYOVER") {
							if (iDutyIndex == 0)
								continue;
							const auto & prevDuty = (*it_roster)->pairing->getDuty(iDutyIndex - 1);
							const auto& checkStart = prevDuty->getLastDropoff()->getEndTimeUtcAct();
							const auto& checkEnd = duty->getFirstPickup()->getStartTimeUtcAct();
							//Rest_Ranges* rest_before_duty = new Rest_Ranges();
							//rest_before_duty->startInUtc = prevDuty->getEndTimeUtcAct();
							//rest_before_duty->endInUtc = duty->getStartTimeUtcAct();
							//vector<Rest_Ranges*> rests;
							//rests.push_back(rest_before_duty);
							int localNight = DutyUtils::GetLocalNightNums(checkStart, checkEnd, offsetMinutes, local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval);
							//int localNight = Utility::GetInstancePtr()->hasXConsecutiveLocalNightsBeforeTm(rests, iLocalsRequired, prevDuty->getEndTimeUtcAct(), local_night, offsetMinutes);
							if (checkEnd - checkStart < iMinRest * 60 || localNight < iLocalsRequired) {
								if ((*it_roster)->needRuleCheck == false && this->_application == ROSTER_OPTIMIZER)
									continue;
								//post ULR local nights must be consecutive. Different to pre ulr
								
								bReturn = false;
								stringstream ss;
								ss << "The rest before the ULR duty doesn't contain " << strMinLocalNights << " consecutive local nights or is less than ";
								ss << strMinRest << " hours and " << strMinCalDays << " calendar days.";
								string msg = ss.str();
								this->setLegalityMessage(duty, pCrew, singleRule, msg);
								pCrew->isLegal = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
								rv->rosterId = (*it_roster)->rosterId;
								rv->pairingId = (*it_roster)->pairId;
								rv->dutySequenceNumber = duty->getDutySegNum();
								rv->startDTUtc = duty->getStartTimeUtcAct();
								rv->endDTUtc = duty->getEndTimeUtcAct();
								rv->violation_msg = msg;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("afterOrBefore", "before"));
								rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
								rv->operation_result.insert(pair<string, string>("strMinCalDays", strMinCalDays));
								rv->operation_result.insert(pair<string, string>("strMinLocalNights", strMinLocalNights));
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER) {
									return false;
								}
								//break at next work duty
								break;
								
							}
						}

					}
				}
			}
		}
	}

	return bReturn;
}


//8015
bool LegalityChecker::checkULRRestForPairing(const Pairing* pairing, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkULRRest");
	if (!pairing)
		return true;
	bool bReturn = true;

	//ULR is a duty or roster
	bool bULRIsRoster = true;

	rule8015* cache = (rule8015*)singleRule->parsedParam.get();
	//table2：REST TYPE,MIN REST LENGTH,MIN CALENDAR DAYS,MIN LOCAL NIGHTS,LOCATION
	string strRestType = cache->strRestType;
	string strMinRest = cache->strMinRest;
	string strMinCalDays = cache->strMinCalDays;
	string strMinLocalNights = cache->strMinLocalNights;
	string strLocationBase = cache->strLocationBase;
	string strExceptionCode = cache->exceptionCode;
	vector<string> exceptionCodeList = cache->exceptionCodeList;
	vector<string> exceptionAssignmentGroups = cache->exceptionAssignmentGroups;
	//table1： definition parameters
	//string strMaxSector = cache->strMaxSector;   //20180112 ain: 新增8015 Max Sector
	//string strMinFlightTime = cache->strMinFlightTime; //20180112 ain: 新增8015 Min Flight Time
	//string strMinFDP = cache->strMinFDP; //20180112 ain: 新增8015 Min FDP
	//string strQualifier = cache->strStandbys;
	//int iMaxSector = cache->iMaxSector;//20180112 ain: 新增8015 Min FDP

	//string strLabel = cache->strLabels; 

	//vector<string> strLabels, strQualifiers;
	//split(strLabel, '|', strLabels);
	//split(strQualifier, '|', strQualifiers);
	vector<DBRule> rules = this->_dbData->getRuleFunctions(RULES::ULR_REST_CHECK);
	stable_sort(rules.begin(), rules.end(), block_cmp);
	map<string, string>::const_iterator iter;
	string header, headeValue;
	for (auto& rule : rules)
	{
		if (rule.tableNum == 2)
			continue;
		map<string, string> parameter = rule.params;

		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "EXCEPTION CODE") {
				strExceptionCode = headeValue;
				split(strExceptionCode, '|', exceptionCodeList);
				break;
			}
		}
		break;
	}
	int iMinRest = cache->iMinRest;
	int iRequiredCalDays = cache->iRequiredCalDays;
	int iLocalsRequired = cache->iMinLocalNights;
	int iNights = cache->iMinLocalNights;
	transform(strRestType.begin(), strRestType.end(), strRestType.begin(), ::toupper);
	//definition rules
	if (strRestType.length() < 1)
		return true;
	Local_Night_Definition local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	if (local_night.LocalEnd.empty() && local_night.LocalStart.empty())
	{
		Logger::getRuleLogger()->error("Exception::No local night definition rules (rule 2014).");
		return true;
	}
	int localNightStart = TimeUtils::hhmmToMinutes(local_night.LocalStart);
	int localNightEnd = TimeUtils::hhmmToMinutes(local_night.LocalEnd);
	int localNightInterval = TimeUtils::hhmmToMinutes(local_night.MinRestInterval);

	string base = pairing->getBase();
	//OP1489
	int offsetMinutes = 0;
	if (this->_dbData->scenario.airline != "BR")
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	else
		offsetMinutes = this->_dbData->getAirportOffsetMinutes("TPE");
	string restBase = "*";
	if (strLocationBase == "CREW BASE") {
		restBase = base;
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	}
	if (strRestType != "LAYOVER" && strRestType != "PRE-DUTY-ULR" && strRestType != "POST-DUTY-ULR")
		return true;

	if ((strRestType == "PRE-DUTY-ULR") || (strRestType == "POST-DUTY-ULR") || (strRestType == "LAYOVER"))
	{
		vector<string> exceptionAssignments;
		if (exceptionAssignmentGroups.size() > 0 && exceptionAssignmentGroups[0] != "*" && exceptionAssignmentGroups[0] != "") {
			for (const auto& group : exceptionAssignmentGroups) {
				const auto& list = this->_dbData->getAssignmentsInGroup(group);
				exceptionAssignments.insert(exceptionAssignments.end(), list.begin(), list.end());
			}
		}
		auto isExceptionDuty = [&](const Duty* dutyToCheck) -> bool {
			if (dutyToCheck == nullptr || exceptionAssignments.empty()) {
				return false;
			}
			return find(exceptionAssignments.begin(), exceptionAssignments.end(), dutyToCheck->getAssignment()) != exceptionAssignments.end();
		};
		auto findPrevNonExceptionDuty = [&](std::size_t fromDutyIndex) -> Duty* {
			for (int idx = static_cast<int>(fromDutyIndex) - 1; idx >= 0; --idx) {
				Duty* candidate = pairing->getDuty(static_cast<std::size_t>(idx));
				if (!isExceptionDuty(candidate)) {
					return candidate;
				}
			}
			return nullptr;
		};
		auto findNextNonExceptionDuty = [&](std::size_t fromDutyIndex) -> Duty* {
			for (std::size_t idx = fromDutyIndex + 1; idx < pairing->getNumDuties(); ++idx) {
				Duty* candidate = pairing->getDuty(idx);
				if (!isExceptionDuty(candidate)) {
					return candidate;
				}
			}
			return nullptr;
		};
		if (strRestType == "LAYOVER") {
			bULRIsRoster = false;
		}

		//vector<Duty *> duties = (*it_roster)->pairing->getDutyVec();
		//for (vector<Duty*>::iterator it_duty = duties.begin(); it_duty != duties.end(); ++it_duty)
		for (std::size_t iDutyIndex = 0; iDutyIndex < pairing->getNumDuties(); iDutyIndex++)
		{
			//Duty::DUTY_TYPE dt = (*it_duty)->getType();
			//iDutyIndex++;
			Duty* duty = pairing->getDuty(iDutyIndex);
			//if (dt != Duty::DUTY_PAIRING_REST && dt != Duty::DUTY_BLANK_DAY && ((*it_duty)->isULR()))
			if (duty->isULR())
			{
				//int iNights = stoi(strMinLocalNights);
				time_t start = duty->getStartTimeUtcAct();
				time_t end = duty->getEndTimeUtcAct();
				int iMode = 0;
				time_t DayStart = 0;
				

				if (strLocationBase == "REST LOCATION")
				{
					restBase = duty->getDepStation();
					offsetMinutes = this->_dbData->getAirportOffsetMinutes(restBase);
				}

						
				if (strRestType == "LAYOVER") {
					if (iDutyIndex == 0)
						continue;
					const auto& prevDuty = pairing->getDuty(iDutyIndex - 1);
					const auto& checkStart = prevDuty->getLastDropoff()->getEndTimeUtcAct();
					const auto& checkEnd = duty->getFirstPickup()->getStartTimeUtcAct();
					//Rest_Ranges* rest_before_duty = new Rest_Ranges();
					//rest_before_duty->startInUtc = prevDuty->getEndTimeUtcAct();
					//rest_before_duty->endInUtc = duty->getStartTimeUtcAct();
					//vector<Rest_Ranges*> rests;
					//rests.push_back(rest_before_duty);
					int localNight = DutyUtils::GetLocalNightNums(checkStart, checkEnd, offsetMinutes, local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval);
					//int localNight = Utility::GetInstancePtr()->hasXConsecutiveLocalNightsBeforeTm(rests, iLocalsRequired, prevDuty->getEndTimeUtcAct(), local_night, offsetMinutes);
					if (checkEnd - checkStart < iMinRest * 60 || localNight < iLocalsRequired) {
						
						//post ULR local nights must be consecutive. Different to pre ulr

						bReturn = false;
						stringstream ss;
						ss << "The rest before the ULR duty doesn't contain " << strMinLocalNights << " consecutive local nights or is less than ";
						ss << strMinRest << " hours and " << strMinCalDays << " calendar days.";
						string msg = ss.str();
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->pairingId = pairing->getDbId();
						rv->dutySequenceNumber = duty->getDutySegNum();
						rv->startDTUtc = duty->getStartTimeUtcAct();
						rv->endDTUtc = duty->getEndTimeUtcAct();
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("afterOrBefore", "before"));
						rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
						rv->operation_result.insert(pair<string, string>("strMinCalDays", strMinCalDays));
						rv->operation_result.insert(pair<string, string>("strMinLocalNights", strMinLocalNights));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}
						//break at next work duty
						break;

					}
				}
				else if (strRestType == "PRE-DUTY-ULR") {
					if (iDutyIndex == 0)
						continue;
					if (strLocationBase == "REST LOCATION")
					{
						offsetMinutes = DutyUtils::GetTimeZoneOffsetByDep(*duty, this->_dbData);
					}
					Duty* prevDuty = findPrevNonExceptionDuty(iDutyIndex);
					if (prevDuty) {
						const auto& checkStart = prevDuty->getLastDropoff()->getEndTimeUtcAct();
						const auto& checkEnd = duty->getFirstPickup()->getStartTimeUtcAct();
						const int localNight = DutyUtils::GetLocalNightNums(checkStart, checkEnd, offsetMinutes, local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval);
						if (checkEnd - checkStart < iMinRest * 60 || localNight < iLocalsRequired) {

							//post ULR local nights must be consecutive. Different to pre ulr

							bReturn = false;
							stringstream ss;
							ss << "The rest before the ULR duty doesn't contain " << strMinLocalNights << " consecutive local nights or is less than ";
							ss << strMinRest << " hours and " << strMinCalDays << " calendar days.";
							string msg = ss.str();
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->pairingId = pairing->getDbId();
							rv->dutySequenceNumber = duty->getDutySegNum();
							rv->startDTUtc = duty->getStartTimeUtcAct();
							rv->endDTUtc = duty->getEndTimeUtcAct();
							rv->violation_msg = msg;
							rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
							//OP#1448提供message参数给gantt
							rv->operation_result.insert(pair<string, string>("afterOrBefore", "before"));
							rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
							rv->operation_result.insert(pair<string, string>("strMinCalDays", strMinCalDays));
							rv->operation_result.insert(pair<string, string>("strMinLocalNights", strMinLocalNights));
							this->addRuleViolations(rv, singleRule);
							if (this->GetApplication() == ROSTER_OPTIMIZER) {
								return false;
							}
							//break at next work duty
							break;

						}
					}
				}
				else if (strRestType == "POST-DUTY-ULR") {
					if (iDutyIndex == pairing->getNumDuties() - 1)
						continue;

					if (strLocationBase == "REST LOCATION")
					{
						offsetMinutes = DutyUtils::GetTimeZoneOffsetByArr(*duty, this->_dbData);
					}
					Duty* lastDuty = findNextNonExceptionDuty(iDutyIndex);
					if (lastDuty) {

						const auto& checkStart = duty->getLastDropoff()->getEndTimeUtcAct();
						const auto& checkEnd = lastDuty->getFirstPickup()->getStartTimeUtcAct();
						const int localNight = DutyUtils::GetLocalNightNums(checkStart, checkEnd, offsetMinutes, local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval);
						if (checkEnd - checkStart < iMinRest * 60 || localNight < iLocalsRequired) {

							//post ULR local nights must be consecutive. Different to pre ulr

							bReturn = false;
							stringstream ss;
							ss << "The rest after the ULR is less than " << strMinRest << " hours inclusive " << strMinCalDays << " calendar days with " << strMinLocalNights << " local nights";
							string msg = ss.str();
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->pairingId = pairing->getDbId();
							rv->dutySequenceNumber = duty->getDutySegNum();
							rv->startDTUtc = duty->getStartTimeUtcAct();
							rv->endDTUtc = duty->getEndTimeUtcAct();
							rv->violation_msg = msg;
							rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
							//OP#1448提供message参数给gantt
							rv->operation_result.insert(pair<string, string>("afterOrBefore", "after"));
							rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
							rv->operation_result.insert(pair<string, string>("strMinCalDays", strMinCalDays));
							rv->operation_result.insert(pair<string, string>("strMinLocalNights", strMinLocalNights));
							this->addRuleViolations(rv, singleRule);
							if (this->GetApplication() == ROSTER_OPTIMIZER) {
								return false;
							}
							//break at next work duty
							break;

						}
					}
				}

			}
		}
		
		
	}

	return bReturn;
}

//only for PO optimizer, not for editor or other modules
bool LegalityChecker::checkMinRest(vector<Duty*> duties)
{

	string isRound = "N";
	auto it = _dbData->systemParamMap.find("CALC_REST_ROUND");
	if (it != _dbData->systemParamMap.end())
		isRound = it->second;
	for (std::size_t i = 0; i + 1 < duties.size(); i++)
	{
		//if (duties[i]->getPairingId() == 27051395)
		//	printf("");
		int pickup = duties[i + 1]->getActualPickupMin();
		int dropoff = duties[i]->getActualDropoffMin();
		if (pickup <= 0)
			pickup = duties[i + 1]->getMinPickup();
		if (dropoff <= 0)
			dropoff = duties[i]->getMinDropoff();

		time_t restStart = duties[i]->getEndTimeUtcAct();
		time_t restEnd = duties[i + 1]->getStartTimeUtcAct();
		//cout << utcToUtcString(restStart) << endl;
		//cout << utcToUtcString(restEnd) << endl;
		if (isRound == "Y")
		{
			restStart = Utility::GetInstancePtr()->getTimeByRoundHour(restStart, true);
			restEnd = Utility::GetInstancePtr()->getTimeByRoundHour(restEnd, false);
		}

		int actRest = static_cast<int>(restEnd - restStart) / 60;


		//int actRest = (duties[i + 1]->getStartTimeUtcAct() - duties[i]->getEndTimeUtcAct()) / 60;
		actRest -= (dropoff + pickup);
		if (actRest < duties[i]->getMinRest())
		{
			return false;
		}
	}
	return true;
}

//CREW 为空表示检查纯pairing法规
bool LegalityChecker::checkExtendRestBeforeDuty(vector<Duty*> duties, SharedPtr<CREW> crew)
{
	bool bIsLegal = true;
	int offsetMinutes = 0;
	auto& rules = this->_dbData->getRuleFunctions(RULES::EXTEND_REST_BY_LENGTH);

	if (rules.size() == 0)
		return true;

	string isRound = this->_dbData->systemParamMap["CALC_REST_ROUND"];
	string header, headeValue;
	map<string, string>::const_iterator iter;
	string strType, strStart, strTimes;
	int iType = 0, iStart = 0;
	Local_Night_Definition local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	bool bHasLN = false;

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> restAssignments;
	string airline = this->_dbData->scenario.airline;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); assign++)
	{
		if ((*assign)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assign)->airline == airline))
			restAssignments.push_back((*assign)->assignemnt);
	}

	for (auto& rule : rules)
	{
		auto& parameter = rule.params;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			if (header == "TYPE") {
				strType = headeValue;
			}
			if (header == "START VALUE") {
				strStart = headeValue;
			}
			//不支持*， strHasLN >= 0
			if (header == "MUST HAVE LOCAL NIGHT") {
				bHasLN = (headeValue == "Y");
			}
			//0-则不计算EXTEND REST. MIN REST = strStart + strTimes * round(Act value - strStart)
			if (header == "TIMES OF EXTEND TYPE") {
				strTimes = headeValue;
			}
		}
		int iStart = hhmmStrToMinutes(strStart);
		int iTimes = hhmmStrToMinutes(strTimes);
		if (iStart > 2 * 24 * 60 && !bHasLN)
			return true;

		time_t restStart = 0, restEnd = 0;
		int numberOfLocalNighs = 0;
		if (duties.size() > 0)
		{
			offsetMinutes = this->_dbData->getAirportOffsetMinutes(duties[0]->getDepartureStation());
			for (std::size_t i = 0; i + 1 < duties.size(); i++)
			{
				if (strType == "DP")
					iType = duties[i]->getActualDP();
				else if (strType == "FDP")
					iType = duties[i]->getActualFDP();
				else if (strType == "FT")
					iType = duties[i]->getActualBlockTime();
				else
					return true;
				if (iType < iStart)
					continue;
				restStart = duties[i]->getEndTimeUtcAct();
				restEnd = duties[i + 1]->getStartTimeUtcAct();
				int pickup = duties[i + 1]->getActualPickupMin();
				int dropoff = duties[i]->getActualDropoffMin();
				if (pickup <= 0)
					pickup = duties[i + 1]->getMinPickup();
				if (dropoff <= 0)
					dropoff = duties[i]->getMinDropoff();
				restStart += dropoff * 60;
				restEnd -= pickup * 60;
				if (bHasLN)
				{
					numberOfLocalNighs = Utility::GetInstancePtr()->howManyLocalNightsInRest(restStart, restEnd, 2, local_night, offsetMinutes);

					if (numberOfLocalNighs == 0)
					{
						if (this->GetApplication() == PAIRING_OPTIMIZER)
							return false;

						duties[i]->setLegality(false);
						string errorMsg = "The rest must include the local night.";
						duties[i]->setViolationMessage(errorMsg);
						bIsLegal = false;
					}
				}
				if (iType > iStart)
				{
					int minrest = (iType - iStart);
					if (minrest > (minrest / 60) * 60)
					{
						minrest = (minrest / 60) * 60 + 60;
					}
					minrest = iStart + minrest * iTimes;
					duties[i]->setMinRest(minrest);
				}
			}
		}
		else if (crew != NULL)
		{
			vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
			int rosterSize = (int)rosters.size();
			for (int j = 0; j < rosterSize - 1; j++)
			{
				if (rosters[j]->duty != "FLY" && rosters[j]->duty != "OPR")
					continue;

				int index = Utility::GetInstancePtr()->getWorkingRosterIndexBefore(rosters, restAssignments, j);
				if (index < 0 || index == j)
					continue;
				restStart = rosters[index]->actRestStrUtc;
				restEnd = rosters[j]->actStrUtc;
				if (isRound == "Y")
				{
					restStart = Utility::GetInstancePtr()->getTimeByRoundHour(restStart, true);
					restEnd = Utility::GetInstancePtr()->getTimeByRoundHour(restEnd, false);
				}
				int actualRest = static_cast<int>(restEnd - restStart) / 60;

				if (strType == "DP")
					iType = rosters[index]->pairing->getDuty(rosters[index]->pairing->getNumDuties() - 1)->getActualDP();
				else if (strType == "FDP")
					iType = rosters[index]->pairing->getDuty(rosters[index]->pairing->getNumDuties() - 1)->getActualFDP();
				else if (strType == "FT")
					iType = rosters[index]->pairing->getDuty(rosters[index]->pairing->getNumDuties() - 1)->getActualBlockTime();
				else
					return true;
				int minrest = 0;
				if (iType > iStart)
				{
					minrest = (iType - iStart);
					if (minrest > (minrest / 60) * 60)
					{
						minrest = (minrest / 60) * 60 + 60;
					}
					minrest = iStart + minrest * iTimes;
				}
				numberOfLocalNighs = Utility::GetInstancePtr()->howManyLocalNightsInRest(restStart, restEnd, 2, local_night, offsetMinutes);

				if ((bHasLN && numberOfLocalNighs == 0) || (actualRest < minrest))
				{
					if (this->GetApplication() == PAIRING_OPTIMIZER)
						return false;

					string msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest ({1:minrest}).";
					if ((bHasLN && numberOfLocalNighs == 0))
						msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest ({1:minrest}), or does not include a local night.";
					if (isRound == "Y")
						msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest ({1:minrest}), or does not include a local night [Rounding applied].";
					msg = StringUtils::Format(msg, Utility::GetInstancePtr()->formatMinutes(actualRest), Utility::GetInstancePtr()->formatMinutes(minrest));

					this->setLegalityMessage(rosters[j], NULL, NULL, msg);
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					if (crew)
						rv->crewId = crew->idCrew;
					rv->rosterId = rosters[j]->rosterId;
					//rv->pairingId = rosters[j]->getDbId();
					//rv->dutySequenceNumber = duty->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = restStart;
					rv->endDTUtc = restEnd;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("actualRest", Utility::GetInstancePtr()->formatMinutes(actualRest)));
					rv->operation_result.insert(pair<string, string>("minRest", Utility::GetInstancePtr()->formatMinutes(minrest)));
					this->addRuleViolations(rv, NULL);
					bIsLegal = false;
				}
			}
		}

	}
	return bIsLegal;
}


bool LegalityChecker::checkMinRestBeforeDutyByLength(vector<Duty*> duties, SharedPtr<CREW> crew)
{
	bool bIsLegal = true;
	int offsetMinutes = 0;
	auto& rules = this->_dbData->getRuleFunctions(RULES::REST_BY_LENGTH);

	if (rules.size() == 0)
		return true;

	string isRound = this->_dbData->systemParamMap["CALC_REST_ROUND"];
	string header, headeValue;
	string strType, strRound = "N";
	int iType = 0;

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> restAssignments;
	string airline = this->_dbData->scenario.airline;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); assign++)
	{
		if ((*assign)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assign)->airline == airline))
			restAssignments.push_back((*assign)->assignemnt);
	}

	for (auto& rule : rules)
	{
		auto& parameter = rule.params;
		for (auto iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			if (header == "TYPE") {
				strType = headeValue;
			}
			if (header == "ROUND") {
				strRound = headeValue;
			}
		}
		time_t restStart = 0, restEnd = 0;
		int numberOfLocalNighs = 0;
		if (duties.size() > 0)
		{
			offsetMinutes = this->_dbData->getAirportOffsetMinutes(duties[0]->getDepartureStation());
			for (std::size_t i = 0; i < duties.size(); i++)
			{
				if (strType == "DP")
					iType = duties[i]->getActualDP();
				else if (strType == "FDP")
					iType = duties[i]->getActualFDP();
				else if (strType == "FT")
					iType = duties[i]->getActualBlockTime();
				else
					return true;
				if (strRound == "Y" && iType >(iType / 60) * 60)
				{
					iType = (iType / 60) * 60 + 60;
				}
				/*
				restStart = duties[i]->getEndTimeUtcAct();
				restEnd = duties[i + 1]->getStartTimeUtcAct();
				int pickup = duties[i + 1]->getActualPickupMin();
				int dropoff = duties[i]->getActualDropoffMin();
				if (pickup <= 0)
					pickup = duties[i + 1]->getMinPickup();
				if (dropoff <= 0)
					dropoff = duties[i]->getMinDropoff();
				restStart += dropoff * 60;
				restEnd -= pickup * 60;
				*/
				duties[i]->setMinRest(iType);
			}
		}
		else if (crew != NULL)
		{
			vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
			int rosterSize = (int)rosters.size();
			for (int j = 0; j < rosterSize - 1; j++)
			{
				if (rosters[j]->duty != "FLY" && rosters[j]->duty != "OPR")
					continue;

				int index = Utility::GetInstancePtr()->getWorkingRosterIndexBefore(rosters, restAssignments, j);
				if (index < 0 || index == j)
					continue;

				if (!(rosters[index]->pairing))
					continue;

				restStart = rosters[index]->actRestStrUtc;
				restEnd = rosters[j]->actStrUtc;

				Duty * duty = rosters[index]->pairing->getDuty(rosters[index]->pairing->getNumDuties() - 1);

				if (strType == "DP")
					iType = duty->getActualDP();
				else if (strType == "FDP")
					iType = duty->getActualFDP();
				else if (strType == "FT")
					iType = duty->getActualBlockTime();
				else
					return true;
				if (strRound == "Y" && iType > (iType / 60) * 60)
				{
					iType = (iType / 60) * 60 + 60;
				}

				if (isRound == "Y")
				{
					restStart = Utility::GetInstancePtr()->getTimeByRoundHour(restStart, true);
					restEnd = Utility::GetInstancePtr()->getTimeByRoundHour(restEnd, false);
				}
				int actualRest = static_cast<int>(restEnd - restStart) / 60;

				if (actualRest < iType)
				{
					if (this->GetApplication() == PAIRING_OPTIMIZER)
						return false;

					string msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest ({1:iTypeHHmm}).";
					if (isRound == "Y")
						msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest ({1:iTypeHHmm}) [Rest Rounding applied].";
					msg = StringUtils::Format(msg, Utility::GetInstancePtr()->formatMinutes(actualRest), Utility::GetInstancePtr()->formatMinutes(iType));

					this->setLegalityMessage(rosters[j], NULL, NULL, msg);
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					if (crew)
						rv->crewId = crew->idCrew;
					rv->rosterId = rosters[j]->rosterId;
					//rv->pairingId = rosters[j]->getDbId();
					//rv->dutySequenceNumber = duty->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = restStart;
					rv->endDTUtc = restEnd;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("actualRest", Utility::GetInstancePtr()->formatMinutes(actualRest)));
					rv->operation_result.insert(pair<string, string>("minRest", Utility::GetInstancePtr()->formatMinutes(iType)));
					this->addRuleViolations(rv, NULL);
					bIsLegal = false;
				}
			}
		}

	}
	return bIsLegal;
}

//CREW 为空表示检查纯pairing法规
bool LegalityChecker::checkMinRestByType(vector<Duty*> duties, SharedPtr<CREW> crew)
{
	bool bIsLegal = true;
	int offsetMinutes = 0;
	auto& rules = this->_dbData->getRuleFunctions(RULES::REST_BY_TYPE);

	if (rules.size() == 0)
		return true;

	string isRound = this->_dbData->systemParamMap["CALC_REST_ROUND"];
	string header, headeValue;
	string strType, strLower, strUpper, strHasLN = "0", strMinRest;
	int iType = 0, iLower = 0, iUpper = 99999;
	Local_Night_Definition local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> restAssignments;
	string airline = this->_dbData->scenario.airline;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); assign++)
	{
		if ((*assign)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assign)->airline == airline))
			restAssignments.push_back((*assign)->assignemnt);
	}

	for (auto& rule : rules)
	{
		auto& parameter = rule.params;
		for (auto iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			if (header == "TYPE") {
				strType = headeValue;
			}
			if (header == "TYPE LOWER") {
				strLower = headeValue;
			}
			if (header == "TYPE UPPER") {
				strUpper = headeValue;
			}
			//不支持*， strHasLN >= 0
			if (header == "HAS NO.OF LOCAL NIGHT") {
				strHasLN = headeValue;
			}
			if (header == "MIN REST") {
				strMinRest = headeValue;
			}
		}
		int iLower = hhmmStrToMinutes(strLower);
		int iUpper = hhmmStrToMinutes(strUpper);
		int iMinRest = hhmmStrToMinutes(strMinRest);
		//20190430 ain, HAS NO. OF LOCAL NIGHT 预期 int，实际 Y/N，修正避免异常
		//TODO: ruleParam解析后续应移入 parseRuleParam流程，解析输入数据同时检查数据格式/类型
		if (!isNumberStr(strHasLN.c_str(), strHasLN.length())) {
			Logger::getRuleLogger()->error("ERROR: invalid data, rule_param 8093 'HAS NO. OF LOCAL NIGHT'={}, expect number", strHasLN);
			return false;
		}
		int iNumberOfLN = stoi(strHasLN);
		time_t restStart = 0, restEnd = 0;
		int numberOfLocalNighs = 0;
		if (duties.size() > 0)
		{
			offsetMinutes = this->_dbData->getAirportOffsetMinutes(duties[0]->getDepartureStation());
			for (std::size_t i = 0; i < duties.size(); i++)
			{
				if (strType == "DP")
					iType = duties[i]->getActualDP();
				else if (strType == "FDP")
					iType = duties[i]->getActualFDP();
				else if (strType == "FT")
					iType = duties[i]->getActualBlockTime();
				else
					return true;
				if (iType > iUpper || iType < iLower)
					continue;
				int pickup = 0, dropoff = 0;
				restStart = duties[i]->getEndTimeUtcAct();
				restEnd = i != duties.size() - 1 ? duties[i + 1]->getStartTimeUtcAct(): std::numeric_limits<time_t>::max();
				pickup = i != duties.size() - 1 ? duties[i + 1]->getActualPickupMin(): 0;
				dropoff = duties[i]->getActualDropoffMin();
				if (pickup <= 0)
					pickup = i != duties.size() - 1 ? duties[i + 1]->getMinPickup(): 0;
				if (dropoff <= 0)
					dropoff = duties[i]->getMinDropoff();
				restStart += dropoff * 60;
				restEnd -= pickup * 60;
				numberOfLocalNighs = i != duties.size() - 1 ? Utility::GetInstancePtr()->howManyLocalNightsInRest(restStart, restEnd, iNumberOfLN + 2, local_night, offsetMinutes): std::numeric_limits<int>::max();
				if (numberOfLocalNighs >= iNumberOfLN)
				{
					duties[i]->setMinRest(iMinRest);
					duties[i]->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, iMinRest, RULES::REST_BY_TYPE, rule.idRuleParam, rule.overridebility, rule.classType, rule.description, rule.reference);
				}
			}
		}
		else if (crew != NULL)
		{
			vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
			int rosterSize = (int)rosters.size();
			for (int j = 0; j < rosterSize ; j++)
			{
				if (rosters[j]->duty != "FLY" && rosters[j]->duty != "OPR")
					continue;

				int index = Utility::GetInstancePtr()->getWorkingRosterIndexBefore(rosters, restAssignments, j);
				if (index < 0 || index == j)
					continue;
				restStart = rosters[index]->actRestStrUtc;
				restEnd = rosters[j]->actStrUtc;

				numberOfLocalNighs = Utility::GetInstancePtr()->howManyLocalNightsInRest(restStart, restEnd, iNumberOfLN + 2, local_night, offsetMinutes);
				if (numberOfLocalNighs == iNumberOfLN || (numberOfLocalNighs > iNumberOfLN && iNumberOfLN > 0))
				{
					if (isRound == "Y")
					{
						restStart = Utility::GetInstancePtr()->getTimeByRoundHour(restStart, true);
						restEnd = Utility::GetInstancePtr()->getTimeByRoundHour(restEnd, false);
					}
					int actualRest = static_cast<int>(restEnd - restStart) / 60;

					if (actualRest < iMinRest)
					{
						if (this->GetApplication() == PAIRING_OPTIMIZER)
							return false;

						string msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest ({1:iMinRest}).";
						if (isRound == "Y")
							msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest ({1:iMinRest}) [Rounding applied].";
						msg = StringUtils::Format(msg, Utility::GetInstancePtr()->formatMinutes(actualRest), Utility::GetInstancePtr()->formatMinutes(iMinRest));

						this->setLegalityMessage(rosters[j], NULL, NULL, msg);
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->idRule = RULES::REST_BY_TYPE;
						if (crew)
							rv->crewId = crew->idCrew;
						rv->rosterId = rosters[j]->rosterId;
						//rv->pairingId = rosters[j]->getDbId();
						//rv->dutySequenceNumber = duty->getDutySegNum();
						//rv->segmentId = (*segment)->getDBId();
						rv->startDTUtc = restStart;
						rv->endDTUtc = restEnd;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("actualRest", Utility::GetInstancePtr()->formatMinutes(actualRest)));
						rv->operation_result.insert(pair<string, string>("minRest", Utility::GetInstancePtr()->formatMinutes(iMinRest)));
						this->addRuleViolations(rv, NULL);
						bIsLegal = false;
					}
				}
			}
		}

	}
	return bIsLegal;
}

bool LegalityChecker::isCallinStandby(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster)
{
	bool bReturn = false;
	if (this->_application == ROSTER_OPTIMIZER)
		return false;
	//0005258: 待命抓飛勤務重疊，出現很多告警訊息
	if (roster != NULL && nextRoster != NULL)
	{
		if ((this->_dbData->isAssignmentInGroup(roster->qualifier, "CSB") || this->_dbData->isAssignmentInGroup(roster->qualifier, "HSB"))
			|| (nextRoster->duty == "FLY" || nextRoster->duty == "OPR"))
		{
			if (roster->actStrUtc <= nextRoster->actStrUtc && roster->actRestStrUtc >= nextRoster->actStrUtc)
				bReturn = true;
		}
	}
	return bReturn;
}

bool LegalityChecker::checkMaxFdp(Pairing * pPairing, SharedPtr<ROSTER> roster)
{
	bool bIsLegal = true;

	for (std::size_t i = 0; i < pPairing->getNumDuties(); i++)
	{
		Duty * duty = pPairing->getDuty(i);
		limitaions* limit = duty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);

		if (!limit)
			continue;

		int actFdp = duty->getActualFDP();
		if (actFdp > limit->value && limit->value>0)
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;
			string msg = "Actual fdp(" + Utility::GetInstancePtr()->formatMinutes(actFdp) + ") ";
			msg += " is more than max fdp(" + Utility::GetInstancePtr()->formatMinutes(limit->value) + ")";

			this->setLegalityMessage(duty, NULL, NULL, msg, limit->last_set_rule);
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->idRule = limit->last_set_rule;
			if (roster)
			{
				rv->crewId = roster->idcrew;
				rv->rosterId = roster->rosterId;
			}
			rv->pairingId = pPairing->getDbId();
			rv->dutySequenceNumber = duty->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("actualFdp", Utility::GetInstancePtr()->formatMinutes(actFdp)));
			rv->operation_result.insert(pair<string, string>("maxFdp", Utility::GetInstancePtr()->formatMinutes(limit->value)));
			this->addRuleViolations(rv, NULL);
			bIsLegal = false;
		}
	}

	return bIsLegal;
}



int LegalityChecker::getMaxRestInRange(vector<WORKDUTY_TIMES *> works, time_t startTime, time_t endTime, bool& needRuleCheckInRange)
{
	int iReturn = 0;
	int dutysize = (int)works.size();

	if (works.empty())
	{
		needRuleCheckInRange = true;
		return static_cast<int>(endTime - startTime) / 60;
	}

	if (works[0]->startUtcTime > endTime)
	{
		needRuleCheckInRange = true;
		return static_cast<int>(endTime - startTime) / 60;
	}

	if (works[dutysize - 1]->endUtcTime < startTime)
	{
		needRuleCheckInRange = true;
		return static_cast<int>(endTime - startTime) / 60;
	}

	if (works[dutysize - 1]->endUtcTime < endTime)
	{
		iReturn = max(iReturn, (int)(endTime - works[dutysize - 1]->endUtcTime) / 60);
		if (works[dutysize - 1]->needRuleCheck == true)
			needRuleCheckInRange = true;
	}

	int i;
	time_t start = 0, end = 0, rest = 0;
	time_t maxx = 0;
	//二分寻找最接近的i
	int l = 0, r = dutysize - 1, mid;
	while (true){
		mid = (l + r) / 2;
		if (mid >= r || mid <= l)break;
		
		if (works[mid]->startUtcTime < startTime){
			l = mid+1;
		}
		if (works[mid]->startUtcTime > startTime){
			r = mid-1;
		}
		if (works[mid]->startUtcTime == startTime){
			break;
		}
	}

	for (i = mid; i < dutysize; i++)
	{
		if ((works[i]->endUtcTime >= startTime && works[i]->startUtcTime <= endTime)||
			(works[i]->endUtcTime >= startTime && works[i]->startUtcTime <= endTime))
		{
			if (works[i]->startUtcTime < maxx){
			//	puts("数据有重叠");
				continue;
			}
			////0002674: [8001]優化班表違反法規8001，且未顯示警告訊息
			//if (i > 0 && works[i - 1]->startUtcTime < startTime && works[i - 1]->endUtcTime > startTime)
			//{
			//	iReturn = max(iReturn, (works[i]->startUtcTime - works[i - 1]->endUtcTime) / 60);
			//}
			//else
			//	iReturn = max(iReturn, (works[i]->startUtcTime - startTime) / 60);
			if (i > 0 && works[i]->startUtcTime > startTime
				&& works[i - 1]->endUtcTime < startTime){
				iReturn = max(iReturn, (int)(works[i]->startUtcTime - startTime) / 60);
			}
			if (i == 0 && works[i]->startUtcTime > startTime){
				iReturn = max(iReturn, (int)(works[i]->startUtcTime - startTime) / 60);
			}
		/*	if (works[i]->startUtcTime < startTime){
				iReturn = max(iReturn, (works[i]->endUtcTime - startTime) / 60);
			}
			else if (works[i]->endUtcTime > endTime){
				iReturn = max(iReturn, (endTime - works[i]->startUtcTime) / 60);
			}
			else*/
			if (i == dutysize - 1){
				iReturn = max(iReturn, (int)(endTime - works[i]->endUtcTime) / 60);
			}
			else{
				if (works[i + 1]->startUtcTime < endTime) {
					iReturn = max(iReturn, (int)(works[i + 1]->startUtcTime - works[i]->endUtcTime) / 60);
				}
				else {
					iReturn = max(iReturn, (int)(endTime - works[i]->endUtcTime) / 60);
				}
			}
			
			if (works[i]->needRuleCheck == true)
				needRuleCheckInRange = true;
			if (works[i]->startUtcTime > maxx)maxx = works[i]->startUtcTime;
			if (works[i]->endUtcTime > maxx)maxx = works[i]->endUtcTime;
		}
	}

	//for (iLast = dutysize - 1; iLast >= 0; iLast--)
	//{
	//	if (works[iLast]->endUtcTime <= endTime && works[iLast]->endUtcTime >= startTime)
	//	{
	//		//0002674: [8001]優化班表違反法規8001，且未顯示警告訊息
	//		if (iLast + 1 < works.size() && works[iLast + 1]->startUtcTime < endTime && works[iLast + 1]->endUtcTime > endTime)
	//		{
	//			iReturn = max(iReturn, (works[iLast + 1]->startUtcTime - works[iLast]->endUtcTime) / 60);
	//		}
	//		else
	//			iReturn = max(iReturn, (endTime - works[iLast]->endUtcTime) / 60);
	//		if (works[iLast]->needRuleCheck == true)
	//			needRuleCheckInRange = true;
	//		break;
	//	}

	//}

	//if (iFirst == dutysize && iLast < 0)
	//{
	//	iReturn = max(iReturn, (endTime - startTime) / 60);
	//}

	if (dutysize == 1)
	{
		start = works[0]->startUtcTime;
		end = works[0]->endUtcTime;
		if (start <= startTime)
			start = startTime;
		if (end >= endTime)
			end = endTime;
		long rest1 = static_cast<long>(start - startTime) / 60;
		long rest2 = static_cast<long>(endTime - end) / 60;
		if ((end >= startTime) && (end <= endTime) &&
			(start >= startTime) && (start <= endTime))
		{
			iReturn = max(iReturn, (int)rest1);
			iReturn = max(iReturn, (int)rest2);
		}
	}

	int j = 0;
	while (j < dutysize - 1)
	{
		start = works[j + 1]->startUtcTime;
		end = works[j]->endUtcTime;

		if (start > endTime && end < startTime) {
			return 144 * 60;
		}

		if (end <= startTime)
			end = startTime;
		if (start >= endTime)
			start = endTime;
		rest = (start - end) / 60;

		if ((end >= startTime) && (end <= endTime) &&
			(start >= startTime) && (start <= endTime))
		{
			iReturn = max(iReturn, (int)rest);
			if (works[j]->needRuleCheck == true || works[j + 1]->needRuleCheck == true)
				needRuleCheckInRange = true;
		}

		j++;
	}

	return iReturn;

}

vector<REST_TIME> LegalityChecker::getMaxRestTimeInRange(int& lastWorksIndex, const vector<WORKDUTY_TIMES*>& works, const time_t startTime, const time_t endTime, bool& needRuleCheckInRange)
{
	vector<REST_TIME> iReturn;
	int dutysize = (int)works.size();

	if (works.empty())
	{
		needRuleCheckInRange = true;
		iReturn.push_back(REST_TIME(startTime, endTime));
		return iReturn;
	}

	if (works[0]->startUtcTime > endTime)
	{
		needRuleCheckInRange = true;
		iReturn.push_back(REST_TIME(startTime, endTime));
		return iReturn;
	}

	if (works[dutysize - 1]->endUtcTime < startTime)
	{
		needRuleCheckInRange = true;
		iReturn.push_back(REST_TIME(startTime, endTime));
		return iReturn;
	}

	int i = 0;
	time_t start = 0, end = 0;
	time_t maxx = 0;
	//二分寻找最接近的i
	int l = 0, r = dutysize - 1, mid = 0;
	while (true) {
		mid = (l + r) / 2;
		if (mid >= r || mid <= l)break;

		if (works[mid]->startUtcTime < startTime) {
			l = mid;
		}
		if (works[mid]->startUtcTime > startTime) {
			r = mid - 1;
		}
		if (works[mid]->startUtcTime == startTime) {
			break;
		}
	}


	for (int i = mid; i < dutysize; i++) {
		lastWorksIndex = i;
		if (i == mid) {
			//第一个
			if (works[i]->startUtcTime > startTime) {
				//[startTime, works[0]->startUtcTime] 为休息
				//iReturn = REST_TIME::GetMax(iReturn, REST_TIME(startTime, std::min(works[i]->startUtcTime, endTime)));
				iReturn.push_back(REST_TIME(startTime, std::min(works[i]->startUtcTime, endTime)));
			}
		}
		
		if (i == dutysize - 1) {
			//最后一个
			if (works[i]->endUtcTime < endTime) {
				//iReturn = REST_TIME::GetMax(iReturn, REST_TIME(std::max(works[i]->endUtcTime, startTime), endTime));
				iReturn.push_back(REST_TIME(std::max(works[i]->endUtcTime, startTime), endTime));
				if (works[i]->needRuleCheck)
					needRuleCheckInRange = true;
			}
			break;
		}

		//iReturn = REST_TIME::GetMax(iReturn, REST_TIME(std::max(works[i]->endUtcTime,startTime), std::min(works[i + 1]->startUtcTime, endTime)));
		iReturn.push_back(REST_TIME(std::max(works[i]->endUtcTime, startTime), std::min(works[i + 1]->startUtcTime, endTime)));
		if (works[i]->needRuleCheck || works[i + 1]->needRuleCheck)
			needRuleCheckInRange = true;

		/*if (iReturn.restMinutes >= iMinRest) {
			return iReturn;
		}*/

		if (works[i + 1]->startUtcTime > endTime) {
			break;
		}
	}
	return iReturn;

}

bool LegalityChecker::restHaveNites(vector<WORKDUTY_TIMES *> works, time_t startTime, time_t endTime, bool& needRuleCheckInRange, string localNiteStart, string localNiteEnd, string localNites, int iMinRest) {
	bool have = false;
	int counts = std::stoi(localNites);

	int dutysize = (int)works.size();

	if (works.empty())
	{
		needRuleCheckInRange = true;
		return true;
	}
	if (dutysize == 1) {
		return true;
	}
	if (works[0]->startUtcTime > endTime)
	{
		needRuleCheckInRange = true;
		return true;
	}

	if (works[dutysize - 1]->endUtcTime < startTime)
	{
		needRuleCheckInRange = true;
		return true;
	}

	if (works[dutysize - 1]->endUtcTime < endTime)
	{
		if (works[dutysize - 1]->needRuleCheck == true)
			needRuleCheckInRange = true;

		return true;
	}

	int start = hhmmToMinutes(localNiteStart.c_str());
	int end = hhmmToMinutes(localNiteEnd.c_str());
	
	bool findFirstRosterAfterStartTm = false;
	for (int i = /*mid*/0; i < dutysize; i++) {
		//1. 如果duty开始时间在144周期之前，略过
		if (works[i]->startUtcTime < startTime)
			continue;

		//2. 找到第一个在144周期内开始的roster，如果这个roster是首roster,检查区间为[startTime, duty开始时间]
		//如果不是首roster，检查区间为[max(startTime, 前一个duty结束时间)， duty开始时间]
		if (!findFirstRosterAfterStartTm) {
			time_t calculateStartTime;
			if (i == 0)
				calculateStartTime = startTime;
			else
				calculateStartTime = max(startTime, works[i - 1]->endUtcTime);


			if (works[i]->startUtcTime - calculateStartTime >= iMinRest * 60) {

				//换算成当地时间
				calculateStartTime = calculateStartTime + static_cast<long>(works[i]->startLocTime - works[i]->startUtcTime);

				time_t checkStartLocTime = calculateStartTime - (calculateStartTime % 86400) + 86400 + start * 60;
				time_t checkEndLocTime = calculateStartTime - (calculateStartTime % 86400) + counts * 86400 + end * 60;
				if (works[i]->startLocTime > checkEndLocTime) {
					have = true;
					return have;
				}
			}

			findFirstRosterAfterStartTm = true;
			continue;
		}

		//3. 对之后的，在144周期内开始的duty，检查区间为[前一个duty结束，duty开始]
		if (works[i]->startUtcTime <= endTime && works[i]->startUtcTime - works[i - 1]->endUtcTime >= iMinRest * 60) {
			time_t checkStartLocTime = works[i - 1]->endLocTime - (works[i - 1]->endLocTime % 86400) + 86400 + start * 60;
			time_t checkEndLocTime = works[i - 1]->endLocTime - (works[i - 1]->endLocTime % 86400) + counts * 86400 + end * 60;
			if (works[i - 1]->endLocTime < checkStartLocTime && works[i]->startLocTime > checkEndLocTime) {
				have = true;
				return have;
			}
		}
	}

	return have;
}

// mantis#4670, mantis#5239, 找出休息restTime的開始時間, 找不到則回傳restStart
time_t LegalityChecker::getRestStartInRange(int restMinutes, vector<WORKDUTY_TIMES *> works, time_t startTime, time_t endTime)
{
	time_t restStart, restEnd;

	restStart = startTime;

	for (auto& work : works)
	{
		if (work->endUtcTime < startTime)
		{
			continue;
		}
		else if (work->startUtcTime > endTime)
		{
			break;
		}
		restEnd = work->startUtcTime;
		if (static_cast<int>((restEnd - restStart) / 60) == restMinutes)
		{
			return restStart;
		}
		restStart = work->endUtcTime;
	}

	return restStart;
}

/*
检查在某个时间范围内Roster里，是否存在iMinutesRest分钟休息时间
*/
bool LegalityChecker::checkXRestInRange(int iMinutesRest, vector<WORKDUTY_TIMES *> works, time_t startTime, time_t endTime){
	int j = 0;
	if (works.empty())
		return true;
	int dutysize = (int)works.size();
	//开头和结尾的检查
	bool bLegal = false;

	vector<WORKDUTY_TIMES*>::iterator itbegin;
	for (itbegin = works.begin(); itbegin != works.end(); itbegin++){
		if ((*itbegin)->startUtcTime > startTime)
			break;
	}
	if (itbegin != works.end())
		bLegal = ((*itbegin)->startUtcTime - startTime >= iMinutesRest * 60);
	else
		bLegal = true;

	vector<WORKDUTY_TIMES*>::reverse_iterator itend;
	if (!bLegal){
		for (itend = works.rbegin(); itend != works.rend(); ++itend){
			if ((*itend)->endUtcTime < endTime)
				break;
		}
		if (itend != works.rend())
			bLegal = (endTime - (*itend)->endUtcTime >= iMinutesRest * 60);
		else
			bLegal = true;
	}

	time_t start, end, rest;
	if (dutysize == 1 && !bLegal){
		start = works[0]->startUtcTime;
		end = works[0]->endUtcTime;
		if (start <= startTime)
			start = startTime;
		if (end >= endTime)
			end = endTime;
		long rest1 = static_cast<long>(start - startTime) / 60;
		long rest2 = static_cast<long>(endTime - end) / 60;
		if ((end >= startTime) && (end <= endTime) &&
			(start >= startTime) && (start <= endTime))
		{
			if ((rest1 >= iMinutesRest) || (rest2 >= iMinutesRest))
				bLegal = true;
		}
	}


	while ((j < dutysize - 1) && (!bLegal))
	{
		start = works[j + 1]->startUtcTime;
		end = works[j]->endUtcTime;

		if (start <= startTime)
			start = startTime;
		if (end >= endTime)
			end = endTime;

		rest = (start - end) / 60;

		if ((end >= startTime) && (end <= endTime) &&
			(start >= startTime) && (start <= endTime))
		{
			if (rest >= iMinutesRest)
				bLegal = true;
		}

		j++;

	}

	return bLegal;
}



void LegalityChecker::setCompositionDefinition(){
	int basicCompositionPriority = 99999;
	string basicCompositionName = RuleParams::GetInstancePtr()->basicComposition;
	long long basicCompositionId = RuleParams::GetInstancePtr()->basicCompositionId;
	if (_dbData->version >= 3) {
		// 20230313 改用基础数据的compositionList代替3013， 从v3开始法规3013将弃用
		for (auto& comp : _dbData->compositionList) {
			auto it = _dbData->compositionRankMap.find(comp.getCompositionId());
			if (it == _dbData->compositionRankMap.end())
				continue;

			if (comp.getAirlineCode() != _dbData->scenario.airline)
				continue;

			if (comp.getDivision() != _dbData->scenario.division)
				continue;

			RULE_COMPOSITION rule_composition;
			rule_composition.name = comp.getName();
			rule_composition.priority = comp.getOrder();
			
			const auto& rankmap = it->second;
			for (auto &kv : rankmap.rankValue) {
				if (kv.plan_value == 0)
					continue;
				rule_composition.rankComposition.insert({ kv.rank, kv.plan_value });
			}
			if (rule_composition.priority < basicCompositionPriority)
			{
				basicCompositionPriority = min(rule_composition.priority, basicCompositionPriority);
				basicCompositionName = rule_composition.name;
				basicCompositionId = comp.getCompositionId();
			}
		
			this->_composition.push_back(rule_composition);
		}
	}
	else {
		// V2和之前使用3013
		for (size_t iRule = 0; iRule < this->_dbData->ruleList.size(); iRule++) {
			DBRule singleRule = this->_dbData->ruleList[iRule];
			if (singleRule.function == RULES::COMPOSITION_DEFINITION) {
				auto& parameter = singleRule.params;

				map<string, string>::const_iterator iter;

				string header, headeValue;
				string priority, composition, ca_value, rca_value, fo_value, so_value;
				RULE_COMPOSITION rule_composition;
				//HIERARCHY,COMPOSITION,CA,RCA,FO,SO
				//2,3P-1,1,0,1,1
				for (iter = parameter.begin(); iter != parameter.end(); iter++)
				{
					header = iter->first;
					headeValue = iter->second;
					//transform(header.begin(), header.end(), header.begin(), ::toupper);
					//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

					if (_debug)
						cout << "Header=" << header << ":value=" << headeValue << endl;

					if (header == "HIERARCHY") priority = headeValue;
					if (header == "COMPOSITION")  composition = headeValue;

					//if (header == "CA") ca_value = headeValue;
					//if (header == "RCA") rca_value = headeValue;
					//if (header == "FO") fo_value = headeValue;
					//if (header == "SO") so_value = headeValue;

					if ((header != "HIERARCHY") && (header != "COMPOSITION"))
					{
						rule_composition.rankComposition.insert(pair<string, int>(header, stoi(headeValue)));
					}
				}
				rule_composition.priority = stoi(priority);
				rule_composition.name = composition;

				//rule_composition.rankComposition.insert(pair<string, int>("CA", boost::lexical_cast<int>(ca_value)));
				//rule_composition.rankComposition.insert(pair<string, int>("RCA", boost::lexical_cast<int>(rca_value)));
				//rule_composition.rankComposition.insert(pair<string, int>("FO", boost::lexical_cast<int>(fo_value)));
				//rule_composition.rankComposition.insert(pair<string, int>("SO", boost::lexical_cast<int>(so_value)));

				if (rule_composition.priority < basicCompositionPriority)
				{
					basicCompositionPriority = min(rule_composition.priority, basicCompositionPriority);
					basicCompositionName = rule_composition.name;
				}
				this->_composition.push_back(rule_composition);
			}
		}
	}

	stable_sort(this->_composition.begin(), this->_composition.end(), cmpComposition);
	RuleParams::GetInstancePtr()->basicComposition = basicCompositionName;
	RuleParams::GetInstancePtr()->basicCompositionId = basicCompositionId;
}



bool LegalityChecker::checkMinCrewAtLayoverByBase(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{

	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strBase, strLayover, strMinCrew, strRank, strFleet, strNationlity = "*";
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASE") {
			strBase = headeValue;
		}
		if (header == "RANK") {
			strRank = headeValue;
		}
		if (header == "FLEET") {
			strFleet = headeValue;
		}
		if (header == "NATIONALITY") {
			strNationlity = headeValue;
		}
		if (header == "LAYOVER") {
			strLayover = headeValue;
		}
		if (header == "MIN CREW") {
			strMinCrew = headeValue;
		}
	}
	int iMin = stoi(strMinCrew);
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& cofs = this->_dbData->crewOnFlt;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		if (!(*roster)->pairing || (this->_application == ROSTER_OPTIMIZER && !(*roster)->needRuleCheck))
			continue;
		vector<Duty *> duties = (*roster)->pairing->getDutyVec();
		if (!Utility::GetInstancePtr()->isHalfRoster((*roster)))
		{

		}
		for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); duty++)
		{
			if (strLayover != "*" && (*duty)->getArrStation() != strLayover)
				continue;
			//if ((*duty)->getArrStation() == (*duty)->getDepStation())
			//	continue;
			vector<Segment*> segments = (*duty)->getSegments();
			Segment* last = segments[segments.size() - 1];

			long long fltId = last->getDBId();

			unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>::iterator crews_it = cofs.find(fltId);
			if (crews_it != cofs.end())
			{
				vector<SharedPtr<CrewOnFlight>> crews = (*crews_it).second;
				int iSize = 0;

				for (vector<SharedPtr<CrewOnFlight>>::iterator singleCrew = crews.begin(); singleCrew != crews.end(); singleCrew++)
				{
					if ((*singleCrew)->crew->nationality == strNationlity || strNationlity == "*")
						iSize++;
				}

				if (iSize < iMin)
				{
					isValid = false;
					string errorMsg = "The number(" + Utility::GetInstancePtr()->ToString(iSize);
					errorMsg += ") of crew with nationality(" + strNationlity + ") at the layover station(" + strLayover + ") must be at least " + strMinCrew;
					errorMsg += " on flight (ID=" + Utility::GetInstancePtr()->ToString(fltId);
					errorMsg += ").";
					setLegalityMessage((*duty), pCrew, singleRule, errorMsg);
					pCrew->isLegal = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = (*roster)->rosterId;
					rv->pairingId = (*duty)->getPairingId();
					rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = current->getDBId();
					rv->startDTUtc = (*duty)->getStartTimeUtcAct();
					rv->endDTUtc = (*duty)->getEndTimeUtcAct();
					rv->violation_msg = errorMsg;
					rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("iSize", Utility::GetInstancePtr()->ToString(iSize)));
					rv->operation_result.insert(pair<string, string>("strNationlity", strNationlity));
					rv->operation_result.insert(pair<string, string>("strLayover", strLayover));
					rv->operation_result.insert(pair<string, string>("strMinCrew", strMinCrew));
					rv->operation_result.insert(pair<string, string>("fltId", Utility::GetInstancePtr()->ToString(fltId)));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}

				}
			}
		}
	}


	return isValid;

}

bool LegalityChecker::checkHomeStandby(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strBase = "TPE", strRank = "CA", strFleet = "778", strLimitedAssGroup = "FLY|RB", strStandbyAsstGroup = "RB", strQualifier = "SHS|LHS|UHS", strLocation = "TSA", strStandbyBase = "TSA";
	//BASE,RANK,FLEET,LIMITED ASSIGNMENT GROUP,LIMITED ROSTER LOCATION,STANDBY ASSIGNMENT GROUP,STANDBY QUALIFIER,STANDBY LOCATION
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASE") {
			strBase = headeValue;
		}
		if (header == "RANK") {
			strRank = headeValue;
		}
		if (header == "FLEET") {
			strFleet = headeValue;
		}
		if (header == "LIMITED ASSIGNMENT GROUP") {
			strLimitedAssGroup = headeValue;
		}
		if (header == "LIMITED ROSTER LOCATION") {
			strLocation = headeValue;
		}
		if (header == "STANDBY ASSIGNMENT GROUP") {
			strStandbyAsstGroup = headeValue;
		}
		if (header == "STANDBY QUALIFIER") {
			strQualifier = headeValue;
		}
		if (header == "STANDBY LOCATION") {
			strStandbyBase = headeValue;
		}
	}

	vector<string> strAssgnGroups, strSBQualifiers, strSBGroups;
	split(strLimitedAssGroup, '|', strAssgnGroups);
	split(strQualifier, '|', strSBQualifiers);
	split(strStandbyAsstGroup, '|', strSBGroups);
	/*boost::split(strAssgnGroups, strLimitedAssGroup, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(strSBQualifiers, strQualifier, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(strSBGroups, strStandbyAsstGroup, boost::is_any_of("|"), boost::token_compress_on);*/

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	int iRosterSize = (int)rosters.size();

	if (iRosterSize == 0)
		return true;

	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	string rosterLocation, rosterDuty;
	int workingDutyBeforestandby = -1;
	for (int i = 0; i < iRosterSize; i++)
	{
		rosterLocation = rosters[i]->location;
		rosterDuty = rosters[i]->duty;
		if (RuleParams::GetInstancePtr()->isRestAssignment(rosters[i]->qualifier, rosters[i]->duty))
			continue;

		if (strQualifier != "*" && !(rosters[i]->pairing))
		{
			workingDutyBeforestandby = i;
			continue;
		}

		if (strStandbyAsstGroup != "*" && std::find(strSBGroups.begin(), strSBGroups.end(), rosterDuty) == strSBGroups.end())
		{
			workingDutyBeforestandby = i;
			continue;
		}
		if (strQualifier != "*" && std::find(strSBQualifiers.begin(), strSBQualifiers.end(), rosters[i]->qualifier) == strSBQualifiers.end())
		{
			workingDutyBeforestandby = i;
			continue;
		}
		if (strStandbyBase != "*" && rosterLocation != strStandbyBase)
		{
			workingDutyBeforestandby = i;
			continue;
		}

		int iNextWorkingIndex = Utility::GetInstancePtr()->getNextWorkingRosterIndex(rosters, _restAssignments, i);

		//上面已经满足standby条件，接下来检查roster[i]的limited条件
		if (iNextWorkingIndex >= 0 && iNextWorkingIndex < iRosterSize)
		{
			rosterLocation = rosters[iNextWorkingIndex]->location;
			rosterDuty = rosters[iNextWorkingIndex]->duty;
			if (!(strLimitedAssGroup != "*" && std::find(strAssgnGroups.begin(), strAssgnGroups.end(), rosterDuty) == strAssgnGroups.end()))
			{
				if ((strLocation != "*" && rosterLocation == strLocation) || (strLocation == "*"))
				{
					if (!(this->_application == ROSTER_OPTIMIZER && !(rosters[i]->needRuleCheck) && !(rosters[iNextWorkingIndex]->needRuleCheck)))
					{
						isValid = false;
						string errorMsg = "The two rosters[" + Utility::GetInstancePtr()->ToString(rosters[i]->rosterId);
						errorMsg += "," + Utility::GetInstancePtr()->ToString(rosters[iNextWorkingIndex]->rosterId) + "] should not be directly connected according to the parameters[(";
						errorMsg += strLimitedAssGroup + "," + strLocation + "," + strLocation + "),(";
						errorMsg += strStandbyAsstGroup + "," + strQualifier + "," + strStandbyBase + ")].";
						setLegalityMessage(rosters[i], pCrew, singleRule, errorMsg);
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crew->idCrew;
						rv->rosterId = rosters[i]->rosterId;
						rv->startDTUtc = rosters[i]->actStrUtc;
						rv->endDTUtc = rosters[i]->actRestStrUtc;
						rv->violation_msg = errorMsg;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString(rosters[i]->rosterId)));
						rv->operation_result.insert(pair<string, string>("iNextWorkingIndexRosterId", Utility::GetInstancePtr()->ToString(rosters[iNextWorkingIndex]->rosterId)));
						rv->operation_result.insert(pair<string, string>("rosterLabel", rosters[i]->label));
						rv->operation_result.insert(pair<string, string>("iNextWorkingIndexRosterLabel", rosters[iNextWorkingIndex]->label));
						rv->operation_result.insert(pair<string, string>("strLimitedAssGroup", strLimitedAssGroup));
						rv->operation_result.insert(pair<string, string>("strLocation", strLocation));
						rv->operation_result.insert(pair<string, string>("strStandbyAsstGroup", strStandbyAsstGroup));
						rv->operation_result.insert(pair<string, string>("strQualifier", strQualifier));
						rv->operation_result.insert(pair<string, string>("strStandbyBase", strStandbyBase));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER){
							return false;
						}
					}
				}
			}
		}
		/*
		if (workingDutyBeforestandby >= 0 && workingDutyBeforestandby < iRosterSize)
		{
		rosterLocation = rosters[workingDutyBeforestandby]->location;
		rosterDuty = rosters[workingDutyBeforestandby]->duty;
		if (strLimitedAssGroup != "*" && std::find(strAssgnGroups.begin(), strAssgnGroups.end(), rosterDuty) == strAssgnGroups.end())
		{
		workingDutyBeforestandby = i;
		continue;
		}
		if ((strLocation != "*" && rosterLocation == strLocation) || (strLocation == "*"))
		{
		if (this->_application == ROSTER_OPTIMIZER && !(rosters[i]->needRuleCheck) && !(rosters[workingDutyBeforestandby]->needRuleCheck))
		continue;
		isValid = false;
		string errorMsg = "Two rosters[" + Utility::GetInstancePtr()->ToString(rosters[workingDutyBeforestandby]->rosterId);
		errorMsg += "," + Utility::GetInstancePtr()->ToString(rosters[i]->rosterId) + "] should not be 'directly' connected according to the parameters[(";
		errorMsg += strLimitedAssGroup + "," + strLocation + "," + strLocation + ",";
		errorMsg += strStandbyAsstGroup + "," + strQualifier + "," + strStandbyBase + ")].";
		setLegalityMessage(rosters[i], pCrew, singleRule, errorMsg);
		pCrew->isLegal = false;
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = crew->idCrew;
		rv->rosterId = rosters[i]->rosterId;
		rv->startDTUtc = rosters[i]->actStrUtc;
		rv->endDTUtc = rosters[i]->actRestStrUtc;
		rv->violation_msg = errorMsg;
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
		this->addRuleViolations(rv, singleRule);
		if (this->GetApplication() == ROSTER_OPTIMIZER){
		return false;
		}
		}
		else
		workingDutyBeforestandby = i;

		}*/
	}
	return isValid;
}
//8061
bool LegalityChecker::checkMinRestBeforeAssgngroup(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strGroups, strMinRest, strCheckWindow, strUnit;

	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "MIN REST") {
			strMinRest = headeValue;
		}
		if (header == "CHECK WINDOW BEFORE ASSIGNMENT GROUP") {
			strCheckWindow = headeValue;
		}
		//if (header == "UNIT") {
		//	strUnit = headeValue;
		//}
		if (header == "ASSIGNMENT GROUP") {
			strGroups = headeValue;
		}
	}

	vector<string> strAssgnGroups;
	split(strGroups, '|', strAssgnGroups);
	//boost::split(strAssgnGroups, strGroups, boost::is_any_of("|"), boost::token_compress_on);

	int iRequiredMinutes = stoi(strMinRest.substr(0, strMinRest.find(":"))) * 60 + stoi(strMinRest.substr(strMinRest.find(":") + 1));
	int iCheckWindow = stoi(strCheckWindow.substr(0, strCheckWindow.find(":"))) * 60 + stoi(strCheckWindow.substr(strCheckWindow.find(":") + 1));

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}

	vector<WORKDUTY_TIMES *> works;
	vector<Duty *> allduty;
	string airlinecode = this->_dbData->scenario.airline;
	for (vector<SharedPtr<ROSTER>>::iterator ix = rosters.begin(); ix != rosters.end(); ++ix)
	{

		Pairing * pg = (*ix)->pairing;

		if (RuleParams::GetInstancePtr()->isRestAssignment((*ix)->qualifier, (*ix)->duty))
			continue;

		if (!pg)
		{
			WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
			work->startUtcTime = (*ix)->actStrUtc;
			work->endUtcTime = (*ix)->actRestStrUtc;
			works.push_back(work);
			continue;
		}
		vector<Duty *> dutylist = pg->getDutyVec();
		if (dutylist.empty())
			continue;
		for (size_t i = 0; i < dutylist.size(); i++)
		{
			Duty::DUTY_TYPE dt = dutylist[i]->getType();
			time_t start = dutylist[i]->getStartTimeUtcAct();
			//0001818: OP1165[8061]Rest period
			if (dutylist[i]->getActualPickupMin() >0)
				start -= dutylist[i]->getActualPickupMin() * 60;
			else
				start -= dutylist[i]->getMinPickup() * 60;

			time_t end = dutylist[i]->getEndTimeUtcAct();

			if (dutylist[i]->getActualDropoffMin()>0)
				end += dutylist[i]->getActualDropoffMin() * 60;
			else
				end += dutylist[i]->getMinDropoff() * 60;

			if ((start >= lCheckedStart) && (end <= lCheckedEnd) &&
				(dt != Duty::DUTY_PAIRING_REST) && (dt != Duty::DUTY_BLANK_DAY))
			{
				WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
				work->startUtcTime = start;
				work->endUtcTime = end;
				works.push_back(work);
			}
		}
	}
	stable_sort(works.begin(), works.end(), cmp);
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		if (this->_application == ROSTER_OPTIMIZER && !((*roster)->needRuleCheck))
			continue;
		if (!(Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, (*roster)->actStrUtc, (*roster)->actRestStrUtc)))
			continue;
		if (std::find(strAssgnGroups.begin(), strAssgnGroups.end(), (*roster)->duty) == strAssgnGroups.end())
			continue;

		//for EVA, the standby roster has segment.
		time_t start, end;
		if (!((*roster)->pairing))
		{
			end = (*roster)->actStrUtc;
			start = end - iCheckWindow * 60;
			bool needRuleCheckInRange = false;
			int iRest = getMaxRestInRange(works, start, end, needRuleCheckInRange);
			if (iRest < iRequiredMinutes)
			{
				char startUtcStr[30] = { 0 };
				char endUtcStr[30] = { 0 };
				string strMinutes = Utility::GetInstancePtr()->formatMinutes(iRest);
				Utility::GetInstancePtr()->UTCToUTCStr(start, startUtcStr, sizeof(startUtcStr));
				Utility::GetInstancePtr()->UTCToUTCStr(end, endUtcStr, sizeof(endUtcStr));

				isValid = false;
				string errorMsg = "The rest period(" + strMinutes + ") in the window[${utc:" + string(startUtcStr) + "}-${utc:" + string(endUtcStr) + "}] is less than " + strMinRest;
				setLegalityMessage((*roster), pCrew, singleRule, errorMsg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->rosterId = (*roster)->rosterId;
				rv->startDTUtc = start;
				rv->endDTUtc = end;
				rv->violation_msg = errorMsg;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strMinutes", strMinutes));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					ClearVector(WORKDUTY_TIMES, works); //20190418 ain, mantis#5183, clear mem leak
					return false;
				}
			}
		}
		else
		{
			vector<Duty *> duties = (*roster)->pairing->getDutyVec();
			for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); duty++)
			{
				vector<Segment*> segments = (*duty)->getSegments();
				for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
				{
					end = (*segment)->getStartTimeUtcAct();
					start = end - iCheckWindow * 60;
					bool needRuleCheckInRange = false;
					int iRest = getMaxRestInRange(works, start, end, needRuleCheckInRange);
					if (iRest < iRequiredMinutes)
					{
						string strMinutes = Utility::GetInstancePtr()->formatMinutes(iRest);
						char startUtcStr[30] = { 0 };
						char endUtcStr[30] = { 0 };
						Utility::GetInstancePtr()->UTCToUTCStr(start, startUtcStr, sizeof(startUtcStr));
						Utility::GetInstancePtr()->UTCToUTCStr(end, endUtcStr, sizeof(endUtcStr));

						isValid = false;
						string errorMsg = "The rest(" + strMinutes + ") in the window[${utc:" + string(startUtcStr) + "}-${utc:" + string(endUtcStr) + "}] is less than " + strMinRest;
						setLegalityMessage((*segment), singleRule, errorMsg);
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crew->idCrew;
						rv->rosterId = (*roster)->rosterId;
						rv->pairingId = (*roster)->pairId;
						rv->dutySequenceNumber = (*duty)->getDutySeq();
						rv->segmentId = (*segment)->getDBId();
						rv->startDTUtc = start;
						rv->endDTUtc = end;
						rv->violation_msg = errorMsg;
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("strMinutes", strMinutes));
						rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
						rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
						rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER){
							ClearVector(WORKDUTY_TIMES, works); //20190418 ain, mantis#5183, clear mem leak
							return false;
						}

					}
				}
			}
		}
	}
	ClearVector(WORKDUTY_TIMES, works); //20190418 ain, mantis#5183, clear mem leak
	return isValid;
}

bool LegalityChecker::checkMinDOAfterHome(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strNationality = "JP", strType = "CMT", strGroup = "*", strUnit = "CD", strMin = "1", strMaxViolations = "0";
	int offsetMinutes = 0;
	bool isCountBlank = false;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "NATIONALITY") {
			strNationality = headeValue;
		}
		if (header == "ROSTER DUTY TYPES") {
			strType = headeValue;
		}
		if (header == "POST ASSIGNMENT GROUP") {
			strGroup = headeValue;
		}
		if (header == "UNIT") {
			strUnit = headeValue;
		}
		if (header == "MINIMUM") {
			strMin = headeValue;
		}
		if (header == "MAX VIOLATIONS") {
			strMaxViolations = headeValue;
		}
		if (header == "COUNT BLANK DAY") {
			isCountBlank = (headeValue == "Y");
		}
	}

	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return true;

	if (strUnit != "CD")
	{
		if (this->_debug)
			printf("Only Support CD for Parameter Unit.");
		return true;
	}

	if (crew->nationality == strNationality || strNationality == "*")
	{
		int iMaxViol = 0, violatedNumbers = 0;
		if (this->_application == ROSTER_OPTIMIZER)
			iMaxViol = stoi(strMaxViolations);

		vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
		vector<string> strGroups, strTypes;
		split(strGroup, '|', strGroups);
		split(strType, '|', strTypes);
	//	boost::split(strGroups, strGroup, boost::is_any_of("|"), boost::token_compress_on);
	//	boost::split(strTypes, strType, boost::is_any_of("|"), boost::token_compress_on);
		int iMin = stoi(strMin);
		string rosterType;

		//mantis#2617, 按start/end时间段寻找crewBase, 避免crew在scenario.start时刻无crewBase问题
		//string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, this->_dbData->scenario.startDtUTC)
		string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, _dbData->scenario.startDtUTC, _dbData->scenario.endDtUTC + 24 * 3600);
		offsetMinutes = _dbData->getAirportOffsetMinutes(base);

		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
		{
			rosterType = (*roster)->duty;
			if (std::find(strTypes.begin(), strTypes.end(), rosterType) == strTypes.end())
				continue;
			if ((*roster)->pairing)
			{
				vector<Duty *> duties = (*roster)->pairing->getDutyVec();
				if (duties[duties.size() - 1]->getArrStation() != base)
					continue;
			}
			time_t reqStart = (*roster)->actRestStrUtc;
			reqStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(reqStart, offsetMinutes) + 24 * 3600;
			time_t reqEnd = 0;
			if (strUnit == "CD")
				reqEnd = reqStart + iMin * 24 * 3600;
			int iAct = 0;
			if (isCountBlank)
				iAct = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, strGroups, reqStart, reqEnd, offsetMinutes, isCountBlank, true, this->_dbData->airportCodeMap, "", iMin);
			else
				iAct = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, strGroups, reqStart, reqEnd, offsetMinutes, isCountBlank, false, this->_dbData->airportCodeMap, "", iMin);
			if (iAct * iMin < iMin)
			{
				violatedNumbers++;
				if (this->_application == ROSTER_OPTIMIZER)
				{
					//如果违规次数少于设定值，可以在RO里忽略该违规
					//0002815: [8065] 尝试法规允许特定数量的违反
					if (iMaxViol>0 && violatedNumbers <= iMaxViol)
						continue;
					if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, (*roster)->actStrUtc, reqEnd)) && (violatedNumbers <= iMaxViol || iMaxViol == 0))
						continue;

				}

				char startUtcStr[30] = { 0 };
				char endUtcStr[30] = { 0 };
				Utility::GetInstancePtr()->UTCToUTCStr(reqStart + offsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
				Utility::GetInstancePtr()->UTCToUTCStr(reqEnd + offsetMinutes * 60 - 1, endUtcStr, sizeof(endUtcStr));

				isValid = false;

				string errorMsg;

				if (iMin > 1)
				{
					errorMsg = "For " + strNationality + " crew,the number of post rosters with assignment group(Number=" + Utility::GetInstancePtr()->ToString(iAct) + " consecutive ";
					errorMsg += strMin + " " + strUnit + ",Post Assignment Group=" + strGroup;
					errorMsg += ") after Duty Type(" + strType + ") is less than the minimum required(" + strMin + " " + strUnit + ") between [" + startUtcStr + " - " + endUtcStr + "].";

				}
				else
				{
					errorMsg = "For " + strNationality + " crew,the number of post rosters with assignment group(Minimum=" + Utility::GetInstancePtr()->ToString(iAct * iMin);
					errorMsg += ",Post Assignment Group=" + strGroup;
					errorMsg += ") after Duty Type(" + strType + ") is less than min(" + strMin + " " + strUnit + ") between [" + startUtcStr + " - " + endUtcStr + "].";
				}
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				setLegalityMessage(crew, pCrew, singleRule, errorMsg);
				pCrew->isLegal = false;
				rv->crewId = crew->idCrew;
				rv->startDTUtc = reqStart;
				rv->endDTUtc = reqEnd;
				rv->violation_msg = errorMsg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iMin", Utility::GetInstancePtr()->iToa(iMin)));
				rv->operation_result.insert(pair<string, string>("strNationality", strNationality));
				rv->operation_result.insert(pair<string, string>("iAct", Utility::GetInstancePtr()->ToString(iAct)));
				rv->operation_result.insert(pair<string, string>("iMin", Utility::GetInstancePtr()->ToString(iMin)));
				rv->operation_result.insert(pair<string, string>("strMin", strMin));
				rv->operation_result.insert(pair<string, string>("strUnit", strUnit));
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("strGroup", strGroup));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				this->addRuleViolations(rv, singleRule);
				if (this->_application == ROSTER_OPTIMIZER)
					break;
			}
		}
	}

	return isValid;
}

bool LegalityChecker::checkADOinWeeks(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strMax = "3", strBase = "*", strRank = "*", strWeeks = "2", strMin = "2";
	
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASE") {
			strBase = headeValue;
		}
		if (header == "RANK") {
			strRank = headeValue;
		}
		if (header == "WEEKS NUM") {
			strWeeks = headeValue;
		}
		if (header == "MAX ADO") {
			strMax = headeValue;
		}
		if (header == "MIN ADO") {
			strMin = headeValue;
		}
	}

	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	lCheckedStart = this->_dbData->scenario.startDtUTC;
	lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, "*", "*", "*", lCheckedStart, lCheckedEnd))
		return true;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, lCheckedStart);
	auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	time_t yearStart = Utility::GetInstancePtr()->getLocalYearStartInUTC(lCheckedStart, offsetMinutes);
	time_t nextYearStart = Utility::GetInstancePtr()->addYears(yearStart, 1);
	time_t start = yearStart;
	int iWeeks = stoi(strWeeks);
	int iMax = stoi(strMax);
	int iMin = stoi(strMin);

	//get check windows
	vector<Rest_Ranges*> checkWindows;
	while (start < nextYearStart)
	{
		Rest_Ranges *window = new Rest_Ranges();
		window->startInUtc = start;
		window->endInUtc = start + iWeeks * 7 * 24 * 3600;

		if (window->endInUtc + iWeeks * 7 * 24 * 3600>nextYearStart)
			window->endInUtc = nextYearStart;

		checkWindows.push_back(window);

		start = window->endInUtc;
	}

	vector<string> doAssignments;
	vector<SharedPtr<DBRule_8014>> assignments = this->_dbData->rule_8014;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->assignmentGroup == "DO" && (*assignment)->airline == this->_dbData->scenario.airline)
		{
			doAssignments.push_back((*assignment)->assignemnt);
		}
	}

	for (vector<Rest_Ranges*>::iterator checkWindow = checkWindows.begin(); checkWindow != checkWindows.end(); checkWindow++)
	{
		time_t winStart = (*checkWindow)->startInUtc;
		time_t winEnd = (*checkWindow)->endInUtc;

		if (Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, winStart, winEnd))
		{
			int iCurrentDO = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, doAssignments, winStart, winEnd, offsetMinutes, true, true, this->_dbData->airportCodeMap);
			if ((iCurrentDO<iMin) || (iCurrentDO>iMax && this->_application != ROSTER_OPTIMIZER))
			{

				char startUtcStr[30] = { 0 };
				char endUtcStr[30] = { 0 };
				Utility::GetInstancePtr()->UTCToUTCStr(winStart + offsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
				Utility::GetInstancePtr()->UTCToUTCStr(winEnd + offsetMinutes * 60 - 1, endUtcStr, sizeof(endUtcStr));

				isValid = false;
				string errorMsg = "The crew's actual days off(ADO)(" + Utility::GetInstancePtr()->ToString(iCurrentDO);
				errorMsg += ") in the current window[${utc:" + string(startUtcStr) + "} - ${utc:" + string(endUtcStr);
				errorMsg += "}] should be at least " + Utility::GetInstancePtr()->ToString(iMin)+" and no more than ";
				errorMsg += Utility::GetInstancePtr()->ToString(iMax)+".";
				setLegalityMessage(crew, pCrew, singleRule, errorMsg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->startDTUtc = winStart;
				rv->endDTUtc = winEnd;
				rv->violation_msg = errorMsg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iCurrentDO", Utility::GetInstancePtr()->ToString(iCurrentDO)));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("iMin", Utility::GetInstancePtr()->ToString(iMin)));
				rv->operation_result.insert(pair<string, string>("iMax", Utility::GetInstancePtr()->ToString(iMax)));
				this->addRuleViolations(rv, singleRule);
			}

		}
	}
	ClearVector(Rest_Ranges, checkWindows);//mantis#5183, clear mem leak
	return isValid;

}

//8060
bool LegalityChecker::checkAnnualLeave(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strAYDODays = "120", strBases = "*", strRanks = "*", strYearBuffer = "4", strMonthBuffer = "1";
	bool bCountBlank = false, bCountPostRest = false;
	int offsetMinutes = 0;

	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "YDO DAYS") {
			strAYDODays = headeValue;
		}
		if (header == "YEARLY BUFFER DAYS") {
			strYearBuffer = headeValue;
		}
		if (header == "MONTHLY BUFFER DAYS") {
			strMonthBuffer = headeValue;
		}
		if (header == "BASES") {
			strBases = headeValue;
		}
		if (header == "RANKS") {
			strRanks = headeValue;
		}
		if (header == "COUNT BLANK DAY") {
			bCountBlank = (headeValue == "Y");
		}
		if (header == "POST DUTY REST") {
			bCountPostRest = (headeValue == "Y");
		}
	}

	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	lCheckedStart = this->_dbData->scenario.startDtUTC;
	lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, "*", "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<SharedPtr<CREW_MANDAY_FD>> fdMandays;
	vector<SharedPtr<CREW_MANDAY_CC_AM>> ccMandays;
	vector<SharedPtr<CREW_ENTITLEMENT>>& entitlements = crew->entitlements;
	//0002634: [8060]YDO改为从CREW_ENTITLEMENT获取
	//YDO is replaced by CREW_ENTITLEMENT
	double iYDO = stod(strAYDODays);
	int iYearBuffer = stoi(strYearBuffer);
	int iMonthBuffer = stoi(strMonthBuffer);

	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	//string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, this->_dbData->scenario.startDtUTC);
	//offset = this->_dbData->getAirportOffset(base);
	//mantis#2768, 用 crew->crewBaseTimezoneOffsetIndex代替 getCrewPrimaryBase(), 避免找不到base造成异常
	offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(_dbData->scenario.startDtUTC);

	//mantis#1815, 按local时间计算 iCurrentMonth，避免utc 2017-8-31 16:00计算结果为8月1日问题
	tm temp = { 0 };
	time_t startLocal = utcToLocal(lCheckedStart);
#ifdef _WIN32
	_gmtime32_s(&temp, (__time32_t *)&startLocal);
#else
	gmtime_r(&startLocal, &temp);
#endif
	int iCurrentMonth = temp.tm_mon; //[0-11]

	temp.tm_mon = 0;
	temp.tm_mday = 1;
	temp.tm_hour = 0;

	time_t yearStart = mktime(&temp);

	//0002634: [8060]YDO改为从CREW_ENTITLEMENT获取
	//YDO is replaced by CREW_ENTITLEMENT
	int this_year = temp.tm_year + 1900;

	for (auto entitlement : entitlements)
	{
		if (entitlement->year == this_year && entitlement->type == "DO")
		{
			iYDO = ceil(entitlement->entitlement);
			break;
		}
	}

	time_t monthStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(lCheckedStart, offsetMinutes);
	time_t monthEnd = Utility::GetInstancePtr()->addMonths(monthStart, 1) - 1;

	//int iScenarioDays = (this->_dbData->scenario.endDtUTC - this->_dbData->scenario.startDtUTC) / (24 * 3600) + 1;

	long iTakenDO = 0, iCurrentDO = 0;
	if (crew->division == "P")
	{
		for (auto& fd : crew->mandayFdList)
		{
			if (fd->crewDateUtc <= monthEnd && fd->crewDateUtc >= monthStart)
				iCurrentDO += (fd->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
			if (fd->crewDateUtc < monthStart && fd->crewDateUtc >= yearStart)
				iTakenDO += (fd->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
		}
	}
	else
	{
		for (auto& cc : crew->mandayCcAmList)
		{
			if (cc->crewDateUtc <= monthEnd && cc->crewDateUtc >= monthStart)
				iCurrentDO += (cc->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
			if (cc->crewDateUtc < monthStart && cc->crewDateUtc >= yearStart)
				iTakenDO += (cc->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
		}
	}

	vector<string> doAssignments;
	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
	{
		if ((*assignment)->assignmentGroup == "DO" && (*assignment)->airline == this->_dbData->scenario.airline)
		{
			doAssignments.push_back((*assignment)->assignemnt);
		}
	}
	iCurrentDO = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, doAssignments, monthStart, monthEnd, offsetMinutes, bCountBlank, bCountPostRest, this->_dbData->airportCodeMap);

	//int beforeDays = (this->_dbData->scenario.startDtUTC - yearStart) / (24 * 3600);
	//mantis#1815, 
	int shouldDO = (int)round((double)((double)((iYDO - iTakenDO)) / (double)(12.0 - iCurrentMonth)));
	int iMinDO = max(shouldDO - iMonthBuffer, 0);
	int iMaxDO = min(shouldDO + iMonthBuffer, (int)(iYDO - iTakenDO));

	if ((iCurrentDO<iMinDO) || (iCurrentDO > iMaxDO && this->_application != ROSTER_OPTIMIZER))
	{
		//char startUtcStr[30] = { 0 };
		//char endUtcStr[30] = { 0 };
		//Utility::GetInstancePtr()->UTCToUTCStr(monthStart + offset * 3600, startUtcStr, sizeof(startUtcStr));
		//Utility::GetInstancePtr()->UTCToUTCStr(monthEnd + offset * 3600 - 1, endUtcStr, sizeof(endUtcStr));

		isValid = false;
		stringstream ss;
		//ss << "Crew actual YDO(" << iCurrentDO
		//	<< ") in the current month[${utc:" << startUtcStr << "} - ${utc:" << endUtcStr
		//	<< "}] should be at least " << iMinDO << " and no more than "
		//	<< iMaxDO << ".";
		ss << "Crew's remaining yearly days off(YDO) is " << iYDO - iTakenDO
			<< ",The average monthly days off(MDO) range is " << iMinDO << "-" << iMaxDO
			<< ",The actual monthly days off(MDO) " << iCurrentDO
			<< " in the current month exceeds the limit.";
		string errorMsg = ss.str();
		setLegalityMessage(crew, pCrew, singleRule, errorMsg);
		pCrew->isLegal = false;
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = crew->idCrew;
		rv->startDTUtc = monthStart;
		rv->endDTUtc = monthEnd;
		rv->violation_msg = errorMsg;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		//OP#1448提供message参数给gantt
		rv->operation_result.insert(pair<string, string>("iLeftYDO", Utility::GetInstancePtr()->lToa((long)iYDO - iTakenDO)));
		rv->operation_result.insert(pair<string, string>("iMinDO", Utility::GetInstancePtr()->lToa(iMinDO)));
		rv->operation_result.insert(pair<string, string>("iMaxDO", Utility::GetInstancePtr()->lToa(iMaxDO)));
		rv->operation_result.insert(pair<string, string>("iCurrentDO", Utility::GetInstancePtr()->lToa(iCurrentDO)));
		this->addRuleViolations(rv, singleRule);
	}

	//Only check min DO in last month
	if ((iTakenDO + iCurrentDO < iYDO - iYearBuffer && iCurrentMonth == 11) || (iTakenDO + iCurrentDO > iYDO + iYearBuffer))
	{
		isValid = false;
		stringstream ss;
		ss << "The crew's actual yearly days off(YDO) (" << (iTakenDO + iCurrentDO)
			<< ") this this year should be at least " << (iYDO - iYearBuffer) << " and no more than "
			<< (iYDO + iYearBuffer) << ".";
		string errorMsg = ss.str();
		setLegalityMessage(crew, pCrew, singleRule, errorMsg);
		pCrew->isLegal = false;
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = crew->idCrew;
		rv->startDTUtc = monthStart;
		rv->endDTUtc = monthEnd;
		rv->violation_msg = errorMsg;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		//OP#1448提供message参数给gantt
		rv->operation_result.insert(pair<string, string>("iTakenDOAddiCurrentDO", Utility::GetInstancePtr()->lToa(iTakenDO + iCurrentDO)));
		rv->operation_result.insert(pair<string, string>("iYDOMinusiYearBuffer", Utility::GetInstancePtr()->dToa(iYDO - iYearBuffer)));
		rv->operation_result.insert(pair<string, string>("iYDOAddiYearBuffer", Utility::GetInstancePtr()->dToa(iYDO + iYearBuffer)));
		this->addRuleViolations(rv, singleRule);
	}

	return isValid;
}

//8064 checkRosterConnByLableAndAtt
bool LegalityChecker::checkRosterConnByLableAndAtt(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	rule8064 * cache = (rule8064*)singleRule->parsedParam.get();

	string strBase = cache->strBase;
	string strRank = cache->strRank;
	string strFleet = cache->strFleet;
	string strAttributeA = cache->strAttributeA;
	string strLabelA = cache->strLabelA;
	string strAssignmentA = cache->strAssignmentA;
	string strIsReqA = cache->strIsReqA;
	string strIsReqB = cache->strIsReqB;
	string strAttributeB = cache->strAttributeB;
	string strLabelB = cache->strLabelB;
	string strAssignmentB = cache->strAssignmentB;
	string strAEqualToBase = cache->strAEqualToBase;
	string strBEqualToBase = cache->strBEqualToBase;
	string strQualA = cache->strQualA;
	string strQualB = cache->strQualB;

	vector<string> &vecAttrA = cache->vecAttrA, &vecAttrB = cache->vecAttrB;
	vector<string> &vecLabelA = cache->vecLabelA, &vecLabelB = cache->vecLabelB;
	vector<string> &vecAssignmentA = cache->vecAssignmentA, &vecAssignmentB = cache->vecAssignmentB;
	vector<string> &vecQualA = cache->vecQualA, &vecQualB = cache->vecQualB;
	bool bDirectional = cache->bDirectional;

	string strTemp1, strTemp2, strTemp3, strTemp4, strTemp5, strTempQual;
	vector<string> *vecTempAttr = NULL, *vecTempLabel = NULL, *vecTempAssign = NULL, *vecTempQual = NULL;
	int iCurrentRoster = -1;

	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->actRestStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, lCheckedStart);

	if (this->GetApplication() == ROSTER_OPTIMIZER)
		if (!rosters[pCrew->RosterIndex]->pairing)
			return true;

	int iNextRoster = 0;

	strTemp1 = strAttributeA, strTemp2 = strAssignmentA, strTemp3 = strLabelA, strTemp4 = strIsReqA, strTemp5 = strAEqualToBase, strTempQual = strQualA;
	vecTempAttr = &vecAttrA, vecTempLabel = &vecLabelA, vecTempAssign = &vecAssignmentA, vecTempQual = &vecQualA;
	if (!bDirectional)
	{
		iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, vecAttrA, vecAssignmentA, vecLabelA, vecQualA, strIsReqA, base, strAEqualToBase);
		int iTemp = Utility::GetInstancePtr()->getFirstRoster(rosters, vecAttrB, vecAssignmentB, vecLabelB, vecQualB, strIsReqB, base, strBEqualToBase);
		if (iTemp < iCurrentRoster)
		{
			iCurrentRoster = iTemp;
			strTemp1 = strAttributeB, strTemp2 = strAssignmentB, strTemp3 = strLabelB, strTemp4 = strIsReqB, strTemp5 = strBEqualToBase, strTempQual = strQualB;
			vecTempAttr = &vecAttrB, vecTempLabel = &vecLabelB, vecTempAssign = &vecAssignmentB, vecTempQual = &vecQualB;
			iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, vecAttrA, vecAssignmentA, vecLabelA, vecQualA, strIsReqA, base, strAEqualToBase);
		}
		else
			iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, vecAttrB, vecAssignmentB, vecLabelB, vecQualB, strIsReqB, base, strBEqualToBase);
	}
	else
	{
		iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, vecAttrA, vecAssignmentA, vecLabelA, vecQualA, strIsReqA, base, strAEqualToBase);
		iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, vecAttrB, vecAssignmentB, vecLabelB, vecQualB, strIsReqB, base, strBEqualToBase);
	}

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> restAssignments;
	string airline = this->_dbData->scenario.airline;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); assign++)
	{
		if ((*assign)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assign)->airline == airline))
			restAssignments.push_back((*assign)->assignemnt);
	}

	while ((iCurrentRoster != FAILURE) && (iNextRoster != FAILURE))
	{
		int iNextWorkingRoster = Utility::GetInstancePtr()->getNextWorkingRosterIndex(rosters, restAssignments, iCurrentRoster);

		// mantis#6787, 只要Current Roster和Next Roster中間不要有其他的working roster就符合告警條件
		// 例如VSA屬於Rest, 因此找到的iNextWorkingRoster會在iNextRoster之後
		if (iNextWorkingRoster == FAILURE || iNextWorkingRoster >= iNextRoster)
		{
			// mantis#5081, 優化時不管是不是新優化上去的任務都要檢查, current和next都是預佔不報錯
			if ((this->GetApplication() != ROSTER_OPTIMIZER) ||
				(this->GetApplication() == ROSTER_OPTIMIZER && !(rosters[iCurrentRoster]->source == "PA" &&rosters[iNextRoster]->source == "PA")))
				//(this->GetApplication() == ROSTER_OPTIMIZER && (pCrew->RosterIndex == iCurrentRoster || pCrew->RosterIndex == iNextRoster)))
			{
				isValid = false;
				stringstream ss;
				ss << "The roster(" << rosters[iCurrentRoster]->rosterId;
				ss << ") with properties(Attribute=" << strAttributeA;
				ss << ",roster assignment=" << strAssignmentA;
				ss << ",pairing label=" << strLabelA;
				ss << ") can not be directly followed by the roster ";
				ss << rosters[iNextRoster]->rosterId;
				ss << " with properties (Attribute=" << strAttributeB;
				ss << ",roster asiignment=" << strAssignmentB;
				ss << ",pariring label=" << strLabelB << ")";
				string errorMsg = ss.str();
				setLegalityMessage(rosters[iCurrentRoster], pCrew, singleRule, errorMsg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->rosterId = rosters[iCurrentRoster]->rosterId;
				rv->startDTUtc = rosters[iCurrentRoster]->actStrUtc;
				rv->endDTUtc = rosters[iNextRoster]->actRestStrUtc;
				rv->violation_msg = errorMsg;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strAttributeA", strAttributeA));
				rv->operation_result.insert(pair<string, string>("strAttributeB", strAttributeB));
				rv->operation_result.insert(pair<string, string>("strLabelA", strLabelA));
				rv->operation_result.insert(pair<string, string>("strLabelB", strLabelB));
				rv->operation_result.insert(pair<string, string>("iCurrentRosterID", Utility::GetInstancePtr()->llToa(rosters[iCurrentRoster]->rosterId)));
				rv->operation_result.insert(pair<string, string>("iNextRosterID", Utility::GetInstancePtr()->llToa(rosters[iNextRoster]->rosterId)));
				rv->operation_result.insert(pair<string, string>("iCurrentRosterLabel", rosters[iCurrentRoster]->label));
				rv->operation_result.insert(pair<string, string>("iNextRosterLabel", rosters[iNextRoster]->label));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}
		}

		int iTemp1, iTemp2 = 0;

		if (!bDirectional)
		{
			iTemp1 = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, *vecTempAttr, *vecTempAssign, *vecTempLabel, *vecTempQual, strTemp4, base, strTemp5);
			iTemp2 = Utility::GetInstancePtr()->getNextRoster(rosters, iNextRoster, *vecTempAttr, *vecTempAssign, *vecTempLabel, *vecTempQual, strTemp4, base, strTemp5);

			if (iTemp1 < iTemp2)
			{
				iCurrentRoster = iTemp1;
				if ((strTemp1 == strAttributeA) && (strTemp2 == strAssignmentA) && (strTemp3 == strLabelA))
					iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, vecAttrB, vecAssignmentB, vecLabelB, vecQualB, strIsReqB, base, strBEqualToBase);
				else
					iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, vecAttrA, vecAssignmentA, vecLabelA, vecQualA, strIsReqA, base, strAEqualToBase);
			}
			else
			{
				iCurrentRoster = iNextRoster;
				iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, *vecTempAttr, *vecTempAssign, *vecTempLabel, *vecTempQual, strTemp4, base, strTemp5);
				if ((strTemp1 == strAttributeA) && (strTemp2 == strAssignmentA) && (strTemp3 == strLabelA))
				{
					strTemp1 = strAttributeB;
					strTemp2 = strAssignmentB;
					strTemp3 = strLabelB;
					strTemp4 = strIsReqB;
					strTemp5 = strBEqualToBase;
				}
				else
				{
					strTemp1 = strAttributeA;
					strTemp2 = strAssignmentA;
					strTemp3 = strLabelA;
					strTemp4 = strIsReqA;
					strTemp5 = strAEqualToBase;
				}
			}
		}
		else
		{
			iCurrentRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, vecAttrA, vecAssignmentA, vecLabelA, vecQualA, strIsReqA, base, strAEqualToBase);
			iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, vecAttrB, vecAssignmentB, vecLabelB, vecQualB, strIsReqB, base, strBEqualToBase);
		}

	}
	return isValid;
}


void LegalityChecker::addRuleViolations(SharedPtr<CREW> crew, SharedPtr<ROSTER> roster, Pairing* pairing, Duty * duty, Segment* segment, RULE_VIOLATION* prv, const DBRule* singleRule, string message)
{
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (crew)
		rv->crewId = crew->idCrew;
	if (roster)
		rv->rosterId = roster->rosterId;
	if (pairing)
		rv->pairingId = pairing->getDbId();
	if (segment)
	{
		rv->startDTUtc = segment->getStartTimeUtcAct();
		rv->endDTUtc = segment->getEndTimeUtcAct();
		rv->segmentId = segment->getDBId();
		rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	}
	else if (duty)
	{
		rv->startDTUtc = duty->getStartTimeUtcAct();
		rv->endDTUtc = duty->getEndTimeUtcAct();
		rv->dutySequenceNumber = duty->getDutySegNum();
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	else if (pairing)
	{
		rv->startDTUtc = pairing->getStartTimeUtcAct();
		rv->endDTUtc = pairing->getEndTimeUtcAct();
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	else if (roster)
	{
		rv->startDTUtc = roster->actStrUtc;
		rv->endDTUtc = roster->actEndUtc;
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	}
	else
	{
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	if (prv)
		rv->violation_msg = prv->violation_msg;
	else
		rv->violation_msg = message;

	this->addRuleViolations(rv, singleRule);
}

//若rv已存在则delete, 否则加入 list
void LegalityChecker::addRuleViolations(RULE_VIOLATION* rv, const DBRule* singleRule)
{
	if (this->_application == PAIRING_OPTIMIZER || this->_application == ROSTER_OPTIMIZER) { // skip for PO for thread safety
		if (singleRule != nullptr) {
			recordOptimizerRuleFailureById(singleRule->idRule);
		}
		delete rv;
		return;
	}
	if (singleRule)
	{
		rv->idRule = singleRule->idRule;
		rv->ruleParamId = singleRule->idRuleParam;
		if (singleRule->description[0] != '\0') {
			rv->description = singleRule->description;
		} else if (rv->description.empty() && singleRule->function == 2003) {
			rv->description = "Pairing Limitation";
		}
		rv->reference = singleRule->reference;
		rv->ishard = (singleRule->overridebility == "H");
		rv->overridebility = singleRule->overridebility;
        rv->phase = singleRule->phase;
	}
	else
	{
		if (rv->idRule <= 0)
		{
			rv->idRule = 0;
			rv->ishard = false;
			rv->description = "Check general rule";
		}
	}


	bool bFind = false;
	for (vector<RULE_VIOLATION*>::iterator it = _rule_violations.begin(); it != _rule_violations.end(); it++)
	{
		//yuankai.cai 20190514 mantis#5574 当 singlerule为空且 告警信息冲突时 去除告警
		if (singleRule == NULL && (*it)->violation_msg == rv->violation_msg){
			bFind = true;
		}
		else if (((*it)->violation_msg == rv->violation_msg) && (rv->startDTUtc == (*it)->startDTUtc) && (rv->crewId == (*it)->crewId) && rv->idRule == (*it)->idRule
			&& (*it)->pairingId == rv->pairingId && (*it)->rosterId == rv->rosterId && (rv->phase <= 0 || !_dbData->IsSupportRulePhaseConfig() || (*it)->phase == rv->phase)){
			bFind = true;
		}
	}
	if (!bFind) {
		std::unique_lock<std::mutex> addLock(_mutex_rule_violations);		
		this->_rule_violations.push_back(rv);
	}
	//20180124 ain, mantis#2765, mem leak
	else {
		delete rv;
	}
}

void LegalityChecker::setLegalityMessage(SharedPtr<CREW>& pCrew, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage) {

	RuleStatistics::GetInstancePtr()->addViolatedTimes(singleRule->idRule);
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(singleRule->idRule) + "]";
	pCrew->_isLegal = false;
	errorMsg = ruleid + "[Crew=" + pCrew->idCrew + "]" + strMessage;
	vector<string> violations = pCrew->_vilation_messages;
	if (std::find(violations.begin(), violations.end(), errorMsg) == violations.end())
		pCrew->_vilation_messages.push_back(errorMsg);
	if (std::find(this->_violations.begin(), this->_violations.end(), errorMsg) == this->_violations.end())
		this->_violations.push_back(errorMsg);
	lc->isLegal = false;
	lc->legalMessage.push_back(errorMsg);
	if (this->DebugMode())
	{
		cout << "[Crew Error] " << errorMsg << endl;
	}
}

void LegalityChecker::setLegalityMessage(SharedPtr<ROSTER> pRoster, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage, long long ruleId) {
	if (singleRule)
		RuleStatistics::GetInstancePtr()->addViolatedTimes(singleRule->idRule);
	string errorMsg = "";
	string strRuleid;
	if (singleRule)
		strRuleid = "[Rule=" + Utility::GetInstancePtr()->ToString(singleRule->idRule) + "]";
	if (ruleId > 0)
		strRuleid = "[Rule=" + Utility::GetInstancePtr()->ToString(ruleId)+"]";
	pRoster->_isLegal = false;

	errorMsg = strRuleid + "[Roster=" + Utility::GetInstancePtr()->ToString(pRoster->rosterId) + "]" + strMessage;
	vector<string>::iterator rosterit = std::find(pRoster->_vilation_messages.begin(), pRoster->_vilation_messages.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations.begin(), this->_violations.end(), errorMsg);

	if (rosterit == pRoster->_vilation_messages.end())
		pRoster->_vilation_messages.push_back(errorMsg);
	if (thisit == this->_violations.end())
		this->_violations.push_back(errorMsg);
	if (lc)
	{
		lc->isLegal = false;
		lc->legalMessage.push_back(errorMsg);
	}
	if (this->DebugMode())
	{
		cout << "[Roster Error] " << errorMsg << endl;
	}
}

void LegalityChecker::setLegalityMessage(Pairing * pPairing, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage) {
	if (this->_application == PAIRING_OPTIMIZER) {	// skip for PO for thread safety
		recordOptimizerRuleFailureById(singleRule->idRule);
		return;
	}
	RuleStatistics::GetInstancePtr()->addViolatedTimes(singleRule->idRule);
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(singleRule->idRule) + "]";
	pPairing->setLegality(false);

	errorMsg = ruleid + "[Pairing=" + pPairing->getPairingNum() + "]" + strMessage;

	vector<string> violation = pPairing->getViolationMessage();
	vector<string>::iterator pgit = std::find(violation.begin(), violation.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations.begin(), this->_violations.end(), errorMsg);

	if (pgit == violation.end())
		pPairing->setViolationMessage(errorMsg);
	if (thisit == this->_violations.end())
		this->_violations.push_back(errorMsg);
	lc->isLegal = false;
	lc->legalMessage.push_back(errorMsg);
	if (this->DebugMode())
	{
		cout << "[Pairing Error] " << errorMsg << endl;
	}

}

void LegalityChecker::setLegalityMessage(Pairing * pPairing, const DBRule* singleRule, string strMessage) {
	if (this->_application == PAIRING_OPTIMIZER) {	// skip for PO for thread safety
		recordOptimizerRuleFailureById(singleRule->idRule);
		return;
	}
	RuleStatistics::GetInstancePtr()->addViolatedTimes(singleRule->idRule);
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(singleRule->idRule) + "]";
	pPairing->setLegality(false);

	errorMsg = ruleid + "[Pairing=" + pPairing->getPairingNum() + "]" + strMessage;

	vector<string> violation = pPairing->getViolationMessage();
	vector<string>::iterator pgit = std::find(violation.begin(), violation.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations.begin(), this->_violations.end(), errorMsg);

	if (pgit == violation.end())
		pPairing->setViolationMessage(errorMsg);
	if (thisit == this->_violations.end())
		this->_violations.push_back(errorMsg);
	if (this->DebugMode())
	{
		cout << "[Pairing Error] " << errorMsg << endl;
	}

}

void LegalityChecker::setLegalityMessage(Duty * pDuty, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage, long long ruleId)
{
	if (this->_application == PAIRING_OPTIMIZER) {	// skip for PO for thread safety
		if (singleRule) {
			recordOptimizerRuleFailureById(singleRule->idRule);
		}
		return;
	}
	if (singleRule)
		RuleStatistics::GetInstancePtr()->addViolatedTimes(singleRule->idRule);
	string errorMsg = "";
	string strRuleid;
	if (singleRule)
		strRuleid = "[Rule=" + Utility::GetInstancePtr()->ToString(singleRule->idRule) + "]";
	else if (ruleId > 0)
		strRuleid = "[Rule=" + Utility::GetInstancePtr()->ToString(ruleId)+"]";
	else
		strRuleid = "[Rule=]";
	pDuty->setLegality(false);
	errorMsg = strRuleid;
	if (lc && lc->crewIndex >= 0)
		errorMsg += "[Crew=" + this->_dbData->crewList[lc->crewIndex]->idCrew + "]";
	errorMsg += "[Pairing=" + Utility::GetInstancePtr()->ToString(pDuty->getPairingId()) + ",Duty ";
	errorMsg += Utility::GetInstancePtr()->ToString(pDuty->getDutySegNum()) + "]" + strMessage;
	vector<string> violations = pDuty->getViolationMessage();
	vector<string>::iterator dutyit = std::find(violations.begin(), violations.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations.begin(), this->_violations.end(), errorMsg);

	if ((pDuty->getViolationMessage().size() == 0) ||
		(dutyit == violations.end()))
		pDuty->setViolationMessage(errorMsg);
	if ((this->_violations.size() == 0) ||
		(thisit == this->_violations.end()))
		this->addViolations(errorMsg);
	if (lc)
	{
		lc->isLegal = false;
		lc->legalMessage.push_back(errorMsg);
	}
	if (this->DebugMode())
	{
		cout << "[Duty Error] " << errorMsg << endl;
	}

}

void LegalityChecker::setLegalityMessage(Segment * pSegment, const DBRule* singleRule, string strMessage) {
	if (this->_application == PAIRING_OPTIMIZER) {	// skip for PO for thread safety
		recordOptimizerRuleFailureById(singleRule->idRule);
		return;
	}
	RuleStatistics::GetInstancePtr()->addViolatedTimes(singleRule->idRule);
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(singleRule->idRule) + "]";
	pSegment->setLegality(false);

	errorMsg = ruleid + "[Pairing=" + pSegment->getPairingNum() + ",Segment=";
	errorMsg += Utility::GetInstancePtr()->ToString(pSegment->getDBId()) + "]" + strMessage;
	vector<string> violation = pSegment->getViolationMessage();
	vector<string>::iterator segit = std::find(violation.begin(), violation.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations.begin(), this->_violations.end(), errorMsg);

	if (segit == violation.end())
		pSegment->setViolationMessage(errorMsg);
	if (thisit == this->_violations.end())
		this->_violations.push_back(errorMsg);
	//lc->isLegal = false;
	if (this->DebugMode())
	{
		cout << "[Segment Error] " << errorMsg << endl;
	}

}


void LegalityChecker::setLegalityMessage(RULE_LEGALITY * pcrew, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage) {
	RuleStatistics::GetInstancePtr()->addViolatedTimes(singleRule->idRule);
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(singleRule->idRule) + "]";
	pcrew->isLegal = false;
	if (this->_dbData->crewList[pcrew->crewIndex]->idCrew.size() > 0){
		errorMsg = ruleid + "[Crew=" + this->_dbData->crewList[pcrew->crewIndex]->idCrew + "]" + strMessage;
	}
	else
		errorMsg = ruleid + strMessage;
	vector<string>::iterator thisit = std::find(this->_violations.begin(), this->_violations.end(), errorMsg);
	if (thisit == this->_violations.end())
		this->_violations.push_back(errorMsg);
	lc->isLegal = false;
	if (this->DebugMode())
	{
		cout << "[Crew1 Error] " << errorMsg << endl;
	}

}

//Local_Night_Definition LegalityChecker::getLocalNightDefinition()
//{
//	Local_Night_Definition local_definition = RuleParams::GetInstancePtr()->getLocalNightDefinition();
//
//	return local_definition;
//}

void LegalityChecker::setULR(Pairing* pairing)
{
	if (!(pairing))
		return;

	vector<Duty*> duties = pairing->getDutyVec();
	for (vector<Duty*>::iterator it = duties.begin(); it != duties.end(); ++it)
	{
		auto duty = *it;
		if (duty == nullptr) {
			continue;
		}
		duty->setULR(false);
	}
	DBRule singleRule;
	//mantis#2074, manday计算慢, 避免每个duty重新收集func=3010
	auto& dutyBuilder = this->_dbData->getRuleFunctions(RULES::ULR_REST_CHECK);
	//for (size_t iRule = 0; iRule < _appRules.size(); iRule++)
	//{
	//	singleRule = _appRules[iRule];
	//	switch (singleRule.function)
	//	{
	//		case RULES::ULR_REST_CHECK:
	//		{
	//			dutyBuilder.push_back(singleRule);
	//		}
	//	}
	//}
	bool hasDefinitionParams = false;
	string ulrSegs = "99", ulrBlock = "99:00", ulrFdp = "99:00", ulrSby = "", ulrLabel = "*", routes = "*";
	for (size_t iRule = 0; iRule < dutyBuilder.size(); iRule++)
	{
		singleRule = dutyBuilder[iRule];
		map<string, string>::const_iterator iter;
		string header, headeValue;
		auto& parameter = singleRule.params;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter){
			header = iter->first;
			headeValue = iter->second;
			//transform(header.begin(), header.end(), header.begin(), ::toupper);
			//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

			//Definition
			//MAX SECTOR,MIN FLIGHT TIME,MIN FDP
			if (header == "MAX SECTOR") {
				ulrSegs = headeValue;
				hasDefinitionParams = true;
			}
			if (header == "MIN FLIGHT TIME") {
				ulrBlock = headeValue;
				hasDefinitionParams = true;
			}
			if (header == "MIN FDP") {
				ulrFdp = headeValue;
				hasDefinitionParams = true;
			}
			if (header == "(OR)LABELS") {
				ulrLabel = headeValue;
				hasDefinitionParams = true;
			}
			if (header == "(OR)SBY QUALIFIERS") {
				ulrSby = headeValue;
				hasDefinitionParams = true;
			}
			if (header == "ROUTES") {
				routes = headeValue;
				hasDefinitionParams = true;

			}
		}
	}
	vector<string> routeList;
	split(routes, '|', routeList);
	if (!hasDefinitionParams)
	{
		ULRDutyDefinition* rule = _ruleFactory ? _ruleFactory->GetCalcRule<ULRDutyDefinition>() : nullptr;
		if (rule != nullptr) {
			rule->CalculateDuty(pairing);
		}
		return;
	}
	/*
	LABEL、Qualifier、MIN FT/FDP/SECTOR三者之间的关系：
	label/qualifier*逻辑为，该参数不起作用；
	当label/qualifier不为×时，三个条件任何一个匹配上，duty被看作ULR。
	特别是label/qualifier被匹配上时，roster里所有duty都会是ULR.

	*/
	string label = pairing->getLabel();
	string qualifier = pairing->getQualifier();
	int iUlrSegs = 0, iUlrBlockInMins = 0, iUlrFdpInMins = 0;

	vector<string> ulrSbys, ulrLabels;
	if (hasDefinitionParams && ((ulrSegs.length() > 0 && ulrBlock.length() > 0 && ulrFdp.length() > 0) || (ulrSby.length() > 0)))
	{
		iUlrSegs = stoi(ulrSegs);
		iUlrBlockInMins = Utility::GetInstancePtr()->convertToMinutes(ulrBlock);

		iUlrFdpInMins = Utility::GetInstancePtr()->convertToMinutes(ulrFdp);
		split(ulrSby, '|', ulrSbys);
		split(ulrLabel, '|', ulrLabels);
	//	boost::split(ulrSbys, ulrSby, boost::is_any_of("|"), boost::token_compress_on);
	//	boost::split(ulrLabels, ulrLabel, boost::is_any_of("|"), boost::token_compress_on);
	}
	for (vector<Duty*>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
	{
		Duty::DUTY_TYPE dt = (*duty)->getType();

		if (dt == Duty::DUTY_BLANK_DAY || dt == Duty::DUTY_PAIRING_REST){
			continue;
		}

		(*duty)->setULR(false);

		// mantis#6794, ULR應以FT為判斷基準, 不能用BH
		//if (iUlrSegs == (*duty)->getNumFlySegs() && (((*duty)->getBLKInMins() >= iUlrBlockInMins) || ((*duty)->getFDPInSecs() >= iUlrFdpInMins * 60)))
		//	(*duty)->setULR(true);

		if (ulrSby != "*")
		{
			for (auto singleSby : ulrSbys)
			{
				if (qualifier.find(singleSby) != string::npos)
				{
					(*duty)->setULR(true);
					break;
				}
			}
		}
		if (ulrLabel != "*")
		{
			for (auto singleLabel : ulrLabels)
			{
				if (label.find(singleLabel) != string::npos)
				{
					(*duty)->setULR(true);
					break;
				}
			}
		}
		// mantis#4566, 根據actual FT time來判斷是否為ULR
		// mantis#6794, 用FT取代BH來判斷ULR
		if (!(*duty)->isULR())
		{
			for (std::size_t i = 0; i < (*duty)->getNumSegments(); i++)
			{
				Segment* segment = (*duty)->getSegment(i);
				if (segment->getIsOperating() && segment->getEndTimeUtcAct() - segment->getStartTimeUtcAct() >= iUlrBlockInMins * 60)
				{
					(*duty)->setULR(true);
					break;
				}
			}
		}
		//mantis-0012216 CR--ULR法規8015需增加其他判斷條件--ROSCRW-18369
		if (!(*duty)->isULR() && routes != "*")
		{
			bool matchRoute = false;
			for (std::size_t i = 0; i < (*duty)->getNumSegments(); i++)
			{
				if (matchRoute)
					break;
				Segment* segment = (*duty)->getSegment(i);
				if (!segment->getIsOperating())
					continue;
				for (auto& route : _dbData->routeList) {
					if (route->arvArp != "" && route->arvArp != segment->getArrStation())
						continue;
					if (route->depArp != "" && route->depArp != segment->getDepStation())
						continue;
					if (route->fltNum != "" && route->fltNum != segment->getFlightNumber())
						continue;
					//20190324 ain, OP#2022
					//20190418 ain, mantis#5353, segType=D/I/R只存在于flight, 按seg找到flt在获取segType执行匹配计算
					Segment* flt = this->_dbData->flightIdMap[segment->getDBId()].get();
					if (!flt)
						flt = segment;
					if ((route->flt_dt_start != -1 && route->flt_dt_start > flt->getStartTimeLocAct()) || (route->flt_dt_end != -1 && route->flt_dt_end < flt->getEndTimeLocAct())) {
						continue;
					}
					if (route->segType != "" && route->segType != "*" && route->segType != flt->getDomIntType() && (route->flt_dt_start > flt->getStartTimeLocAct() || route->flt_dt_end < flt->getEndTimeLocAct()))
						continue;

					auto attrIter = this->_dbData->attributeIdMap.find(route->routeId);
					if (attrIter != this->_dbData->attributeIdMap.end() && find(routeList.begin(), routeList.end(), attrIter->second.code) != routeList.end()) {
						(*duty)->setULR(true);
						matchRoute = true;
						break;
					}
				}
			}
		}
	}
}

bool LegalityChecker::setDutyBuilderReq(Duty* duty)
{

	//if (duty->getPairingId() == 27051395 && duty->getSegments().size() == 1)
	//	printf("");
	if (!(duty->needRecalculation) && this->_application == PAIRING_OPTIMIZER)
		return true;

	Duty::DUTY_TYPE dt = duty->getType();

	if (dt == Duty::DUTY_BLANK_DAY || dt == Duty::DUTY_PAIRING_REST){
		return true;
	}

	//检查法规设置行与行之间关系具有关联性的法规，比如有通配符*的设置
	//这类法规，先找特殊设置（非*的设置），如找到，没有必要检查一般设置(*)
	//这类法规设置，是按照一般到特殊的关系，从上到下用表格表示
	//目前法规有3001/3010:MIN_CONN_DIP和CHECK_IN_OUT
	//
	DBRule singleRule;

	//mantis#2074, manday计算慢, 避免每个duty重新收集func=3010
	auto& dutyBuilder = this->_dbData->getRuleFunctions(RULES::CHECK_IN_OUT);
	//20181204 ain, mantis#4554, 3010不存在时按 minBrief=actBrief, actBrief来自db
	if (dutyBuilder.empty()) {
		duty->setMinBrief(duty->getActualBriefMin());
		duty->setMinDebrief(duty->getActualDebriefMin());
		duty->setMinPickup(duty->getActualPickupMin());
		duty->setMinDropoff(duty->getActualDropoffMin());
		duty->calculateDutyValues(this->_application);
		return true;
	}
	
	if (duty->getNumSegments() == 0){
		return true;
	}
	string region = getRegion(duty); //mantis#2251, 若region为空则按segment重新计算

	if (!this->_dbData->getRuleFunctions(CHECK_IN_OUT).empty()){
		Rule3010Result result = rule3010Calculator.findMatch(duty->getSegment(0)->getFlightNumber(),
			duty->getDepStation(), duty->getArrStation(),
			duty->getSegment(0)->getStartTimeLocSch(), region,
			duty->getSegment(0)->getAssignment(),
			duty->getSegment(duty->getNumSegments() - 1)->getAssignment());
		duty->setMinBrief(result.briefMinutes);
		duty->setMinDebrief(result.debriefMinutes);
		duty->setMinPickup(result.pickupMinutes);
		duty->setMinDropoff(result.dropMinutes);
		duty->setActualBriefMin(result.briefMinutes);
		duty->setActualDebriefMin(result.debriefMinutes);
		duty->setActualPickupMin(result.pickupMinutes);
		duty->setActualDropoffMin(result.dropMinutes);
		duty->needRecalculation = false;
		duty->calculateDutyValues(this->_application);
	}
	return true;
}
void LegalityChecker::setDutyBrief(Duty* duty, const string& pairingBase){
	int briefTime = 0;
	briefTime = calculateDutyBrief(duty, pairingBase);
	// mantis#6770, EVA沒有3021法規, 會造成同步pairing時briefing被清空
	if (briefTime >= 0)
	{
		duty->setMinBrief(briefTime);
		duty->setActualBriefMin(briefTime);
	}
}
void LegalityChecker::apply3021MaxFdpBriefDelta(Duty* duty, const string& pairingBase) {
	RuleParams::ApplyMaxFdpBriefDeltaToDuty(duty, this->_dbData, pairingBase);
}

int LegalityChecker::calculateDutyBrief(Duty* duty, const string& pairingBase, const string& briefField){
	return RuleParams::CalculateDutyBrief(duty, this->_dbData, pairingBase, briefField);
/*
	auto& dutyBuilder = this->_dbData->getRuleFunctions(RULES::CHECK_IN_OUT_BRIEF);
	//Pairing* pairing = nullptr;
 //   if (this->_application != PAIRING_OPTIMIZER) {
 //       pairing = this->_dbData->pairingIdMap.at(duty->getPairingId());
 //   }

	string pairingDivision;
	if (this->_dbData) {
		pairingDivision = this->_dbData->scenario.division;
	}
	// Fallback where scenario division is not populated yet.
	if (pairingDivision.empty() && duty != nullptr) {
		auto itPairing = this->_dbData->pairingIdMap.find(duty->getPairingId());
		if (itPairing != this->_dbData->pairingIdMap.end() && itPairing->second != nullptr) {
			pairingDivision = itPairing->second->getDivision();
		}
	}

	for (std::size_t i = 0; i < dutyBuilder.size(); i++){
		rule3021* cache = (rule3021*)dutyBuilder[i].parsedParam.get();

		if (!cache->division.empty() && cache->division != "*"
			&& !pairingDivision.empty() && cache->division != pairingDivision) {
			continue;
		}

		string& airport = cache->airport;
		int depStart = cache->depStart;
		int depEnd = cache->depEnd;
		string& dutyType = cache->dutyType;
		vector<string>& fltNumsVec = cache->fltNumsVec;
		vector<string>& fleetsVec = cache->fleetsVec;
		vector<string>& assignment = cache->assignment;
		vector<string>& dutyAssignments = cache->dutyAssignments;
		vector<string>& airlines = cache->airlines;
		shared_ptr<bool>& isTraining = cache->isTraining;
		time_t effDate = cache->effDate;
		time_t expDate = cache->expDate;
		vector<string> courses = cache->courses;
		int dutyBlhRangeLower = cache->dutyBlhRangeLower;
		int dutyBlhRangeUpper = cache->dutyBlhRangeUpper;
		int sectorBlhRangeLower = cache->sectorBlhRangeLower;
		int sectorBlhRangeUpper = cache->sectorBlhRangeUpper;
		string endAirport = cache->endAirport;
		vector<string>& routes = cache->routes;
		vector<string>& pairingBases = cache->pairingBases;

		int briefTime = cache->briefTime;
		Segment * seg = duty->getFirstSegment();
		Segment* lastSeg = duty->getLastSegment();

		//20190723 ain, mantis#6286, 容忍ptn/duty为空
		if (!seg) {
			continue;
		}

		if (airport != "*" && seg->getDepStation() != airport){
			continue;
		}
		if (endAirport != "*" && lastSeg && lastSeg->getArrStation() != endAirport) {
			continue;
		}
		int time = seg->getStartTimeLocAct() % (60 * 60 * 24);
		if (depStart > 0 && time < depStart){
			continue;
		}
		if (depEnd > 0 && time > depEnd) {
			continue;
		}
		if ((expDate != -1 && seg->getStartTimeLocAct() > expDate + 24 * 3600 - 1) || (effDate != -1 && seg->getStartTimeLocAct() < effDate)) {
			continue;
		}
		if (dutyType != "*" && seg->getDomIntType() != dutyType){
			continue;
		}
		if (!fltNumsVec.empty() && fltNumsVec[0] != "*" && find(fltNumsVec.begin(), fltNumsVec.end(), seg->getFlightNumber()) == fltNumsVec.end()){
			continue;
		}
		if (!fleetsVec.empty() && fleetsVec[0] != "*" && find(fleetsVec.begin(), fleetsVec.end(), seg->getFleetCD()) == fleetsVec.end()){
			continue;
		}
		if (!assignment.empty() && assignment[0] != "*" && find(assignment.begin(), assignment.end(), seg->getAssignment()) == assignment.end()){
			continue;
		}
		if (!dutyAssignments.empty() && dutyAssignments[0] != "*" && find(dutyAssignments.begin(), dutyAssignments.end(), duty->getAssignment()) == dutyAssignments.end()) {
			continue;
		}
		if (!airlines.empty() && airlines[0] != "*" && find(airlines.cbegin(), airlines.cend(), seg->getAirline()) == airlines.cend()) {
			continue;
		}
		if (isTraining != nullptr && isTrainingFlight(duty) != *isTraining) {
			continue;
		}
		if (!routes.empty() && !SegmentUtils::MatchRoute(seg, routes, this->_dbData)) {
			continue;
		}
		if (!pairingBases.empty() && std::find(pairingBases.begin(), pairingBases.end(), pairingBase) == pairingBases.end()) {
			continue;
		}
		if (!courses.empty() && courses[0] != "*" && courses[0] != "") {
			auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
			auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
			bool findCourse = false;
			for (const auto& seg : duty->getSegmentsRead()) {
				const auto& rfs = this->_dbData->rosterFlightMgr.get(seg->getDBId());
				if (rfs.empty())
					continue;
				if (findCourse)
					break;
				for (const auto& rf : rfs) {
					if (rf->dutyId == duty->getDutyId()) {
						const auto& programCourse = tmProgramCourseIndex->getByRosterId(rf->rosterId, seg->getDBId());
						if (programCourse == nullptr)
							continue;
						const auto& courseCode = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->_dbData);
						if (find(courses.begin(), courses.end(), courseCode->courseCode) != courses.end()) {
							findCourse = true;
							break;
						}
						const auto& programCourseInstructor = tmProgramCourseInstructorIndex->getByRosterId(rf->rosterId, seg->getDBId());
						if (programCourseInstructor == nullptr)
							continue;
						const auto& instructorCourseCode = TrainingCourseUtils::GetCourseByCourseId(programCourseInstructor->courseId, this->_dbData);
						if (find(courses.begin(), courses.end(), instructorCourseCode->courseCode) != courses.end()) {
							findCourse = true;
							break;
						}
					}
				}
			}
			if (!findCourse)
				continue;
		}
		
		if (dutyBlhRangeLower > 0 || dutyBlhRangeUpper > 0) {
			int blh = 0;
			// duty的blh计算在这个方法之后
			for (const auto& seg : duty->getSegmentsRead()) {
				blh += seg->getBlkMinutes();
			}
			if (dutyBlhRangeLower > 0 && blh < dutyBlhRangeLower) {
				continue;
			}
		}
		bool sectorBlhMatch = false;
		if (sectorBlhRangeLower == 0 && sectorBlhRangeUpper == 0)
			sectorBlhMatch = true;
		else {
			for (const auto& seg : duty->getSegmentsRead()) {
				if (seg->getBlkMinutes() >= sectorBlhRangeLower && seg->getBlkMinutes() <= sectorBlhRangeUpper) {
					sectorBlhMatch = true;
					break;
				}
			}
		}
		if (!sectorBlhMatch)
			continue;
		return briefTime;
	}
	return -1;
*/
}
void LegalityChecker::setDutyDebrief(Duty* duty, const string& pairingBase){
	int debriefTime = 0;
	debriefTime = calculateDutyDebrief(duty, pairingBase);
	// mantis#6770, EVA沒有3022法規, 會造成同步pairing時debriefing被清空
	if (debriefTime >= 0)
	{
		duty->setMinDebrief(debriefTime);
		duty->setActualDebriefMin(debriefTime);
	}
}
int LegalityChecker::calculateDutyDebrief(Duty* duty, const string& pairingBase){
	auto& dutyBuilder = this->_dbData->getRuleFunctions(RULES::CHECK_IN_OUT_DEBRIEF);
	for (std::size_t i = 0; i < dutyBuilder.size(); i++){
		rule3022* cache = (rule3022*)dutyBuilder[i].parsedParam.get();
		string& airport = cache->airport;
		string& dutyType = cache->dutyType;
		vector<string>& fltNumsVec = cache->fltNumsVec;
		vector<string>& fleetsVec = cache->fleetsVec;
		vector<string>& assignment = cache->assignment;
		vector<string>& airlines = cache->airlines;
		shared_ptr<bool>& isTraining = cache->isTraining;
		time_t effDate = cache->effDate;
		time_t expDate = cache->expDate;
		int debriefTime = cache->debriefTime;
		vector<string>& courses = cache->courses;
		vector<string>& pairingBases = cache->pairingBases;

		Segment * seg = duty->getLastSegment();
		//20190723 ain, mantis#6286, 容忍 ptn/duty为空
		if (!seg) {
			continue;
		}
		if (((expDate != -1 && seg->getEndTimeLocAct() > expDate + 24 * 3600 - 1) || (effDate != -1 && seg->getEndTimeLocAct() < effDate))) {
			continue;
		}
		if (airport != "*" && seg->getArrStation() != airport){
			continue;
		}
		if (dutyType != "*" && seg->getDomIntType() != dutyType){
			continue;
		}
		if (!fltNumsVec.empty() && fltNumsVec[0] != "*" && find(fltNumsVec.begin(), fltNumsVec.end(), seg->getFlightNumber()) == fltNumsVec.end()){
			continue;
		}
		if (!fleetsVec.empty() && fleetsVec[0] != "*" && find(fleetsVec.begin(), fleetsVec.end(), seg->getFleetCD()) == fleetsVec.end()){
			continue;
		}
		if (!assignment.empty() && assignment[0] != "*" && find(assignment.begin(), assignment.end(), seg->getAssignment()) == assignment.end()){
			continue;
		}
		if (!airlines.empty() && airlines[0] != "*" && find(airlines.cbegin(), airlines.cend(), seg->getAirline()) == airlines.cend()) {
			continue;
		}
		if (isTraining != nullptr && isTrainingFlight(duty) != *isTraining) {
			continue;
		}
		if (!pairingBases.empty() && std::find(pairingBases.begin(), pairingBases.end(), pairingBase) == pairingBases.end()) {
			continue;
		}
		if (!courses.empty() && courses[0] != "*" && courses[0] != "") {
			auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
			auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
			bool findCourse = false;
			for (const auto& seg : duty->getSegmentsRead()) {
				const auto& rfs = this->_dbData->rosterFlightMgr.get(seg->getDBId());
				if (rfs.empty())
					continue;
				if (findCourse)
					break;
				for (const auto& rf : rfs) {
					if (rf->dutyId == duty->getDutyId()) {
						const auto& programCourse = tmProgramCourseIndex->getByRosterId(rf->rosterId, seg->getDBId());
						if (programCourse == nullptr)
							continue;
						const auto& courseCode = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->_dbData);
						if (find(courses.begin(), courses.end(), courseCode->courseCode) != courses.end()) {
							findCourse = true;
							break;
						}
						const auto& programCourseInstructor = tmProgramCourseInstructorIndex->getByRosterId(rf->rosterId, seg->getDBId());
						if (programCourseInstructor == nullptr)
							continue;
						const auto& instructorCourseCode = TrainingCourseUtils::GetCourseByCourseId(programCourseInstructor->courseId, this->_dbData);
						if (find(courses.begin(), courses.end(), instructorCourseCode->courseCode) != courses.end()) {
							findCourse = true;
							break;
						}
					}
				}
			}
			if (!findCourse)
				continue;
		}
		return debriefTime;
	}
	return -1;
};
void LegalityChecker::setDutyPickup(Duty* duty, const string& pairingBase, const Duty* beforeDuty, const Duty* nextDuty){
	int pickupTime = 0;
	pickupTime = calculateDutyPickup(duty, pairingBase, beforeDuty, nextDuty);
	// mantis#6770, EVA沒有3023法規, 會造成同步pairing時pickup被清空
	if (pickupTime >= 0)
	{
		duty->setMinPickup(pickupTime);
		duty->setActualPickupMin(pickupTime);
	}
}
int LegalityChecker::calculateDutyPickup(Duty* duty, const string& pairingBase, const Duty* beforeDuty, const Duty* nextDuty){
	auto& dutyBuilder = this->_dbData->getRuleFunctions(RULES::CHECK_IN_OUT_PICKUP);
	for (std::size_t i = 0; i < dutyBuilder.size(); i++){
		rule3023* cache = (rule3023*)dutyBuilder[i].parsedParam.get();
		vector<string>& pairingBases = cache->pairingBases;
		auto& isLayover = cache->isLayover;
		string& airport = cache->airport;
		int depStart = cache->depStart;
		int depEnd = cache->depEnd;
		string& dutyType = cache->dutyType;
		vector<string>& fltNumsVec = cache->fltNumsVec;
		vector<string>& fleetsVec = cache->fleetsVec;
		vector<string>& assignment = cache->assignment;
		vector<string>& airlines = cache->airlines;
		int pickupTime = cache->pickupTime;
		time_t effDate = cache->effDate;
		time_t expDate = cache->expDate;

		Segment * seg = duty->getFirstSegment();
		
		//20190723 ain, mantis#6286, 容忍ptn/duty为空
		if (!seg) {
			continue;
		}

		if (!pairingBases.empty() && std::find(pairingBases.begin(), pairingBases.end(), pairingBase) == pairingBases.end()) {
			continue;
		}
		if (isLayover != nullptr && (*isLayover != (beforeDuty != nullptr))) {
			continue;
		}
		if (airport != "*" && seg->getDepStation() != airport){
			continue;
		}
		int time = seg->getStartTimeLocAct() % (60 * 60 * 24);
		if (depStart > 0 && time < depStart) {
			continue;
		}
		if (depEnd > 0 && time > depEnd) {
			continue;
		}
		if ((expDate != -1 && seg->getStartTimeLocAct() > expDate + 24 * 3600 - 1) || (effDate != -1 && seg->getStartTimeLocAct() < effDate)) {
			continue;
		}

		if (dutyType != "*" && seg->getDomIntType() != dutyType){
			continue;
		}
		if (!fltNumsVec.empty() && fltNumsVec[0] != "*" && find(fltNumsVec.begin(), fltNumsVec.end(), seg->getFlightNumber()) == fltNumsVec.end()){
			continue;
		}
		if (!fleetsVec.empty() && fleetsVec[0] != "*" && find(fleetsVec.begin(), fleetsVec.end(), seg->getFleetCD()) == fleetsVec.end()){
			continue;
		}
		if (!assignment.empty() && assignment[0] != "*" && find(assignment.begin(), assignment.end(), seg->getAssignment()) == assignment.end()){
			continue;
		}
		if (!airlines.empty() && airlines[0] != "*" && find(airlines.cbegin(), airlines.cend(), seg->getAirline()) == airlines.cend()) {
			continue;
		}
		return pickupTime;
	}
	return -1;
};
void LegalityChecker::setDutyDropoff(Duty* duty, const string& pairingBase, const Duty* beforeDuty, const Duty* nextDuty){
	int dropoffTime = 0;
	dropoffTime = calculateDutyDropoff(duty, pairingBase, beforeDuty, nextDuty);
	// mantis#6770, EVA沒有3024法規, 會造成同步pairing時dropoff被清空
	if (dropoffTime >= 0)
	{
		duty->setMinDropoff(dropoffTime);
		duty->setActualDropoffMin(dropoffTime);
	}
}
int LegalityChecker::calculateDutyDropoff(Duty* duty, const string& pairingBase, const Duty* beforeDuty, const Duty* nextDuty){
	auto& dutyBuilder = this->_dbData->getRuleFunctions(RULES::CHECK_IN_OUT_DROPOFF);
	for (std::size_t i = 0; i < dutyBuilder.size(); i++){
		rule3024* cache = (rule3024*)dutyBuilder[i].parsedParam.get();
		vector<string>& pairingBases = cache->pairingBases;
		auto& isLayover = cache->isLayover;
		string& airport = cache->airport;
		string& dutyType = cache->dutyType;
		vector<string>& fltNumsVec = cache->fltNumsVec;
		vector<string>& fleetsVec = cache->fleetsVec;
		vector<string>& assignment = cache->assignment;
		vector<string>& airlines = cache->airlines;
		int dropoffTime = cache->dropoffTime;
		time_t effDate = cache->effDate;
		time_t expDate = cache->expDate;

		Segment * seg = duty->getLastSegment();
		//20190723 ain, mantis#6286, 容忍 ptn/duty为空
		if (!seg) {
			continue;
		}
		if (!pairingBases.empty() && std::find(pairingBases.begin(), pairingBases.end(), pairingBase) == pairingBases.end()) {
			continue;
		}
		if (isLayover != nullptr && (*isLayover != (nextDuty != nullptr)) ) {
			continue;
		}
		if (((expDate != -1 && seg->getEndTimeLocAct() > expDate + 24 * 3600 - 1) || (effDate != -1 && seg->getEndTimeLocAct() < effDate))) {
			continue;
		}
		if (airport != "*" && seg->getArrStation() != airport){
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
		if (airlines[0] != "*" && find(airlines.cbegin(), airlines.cend(), seg->getAirline()) == airlines.cend()) {
			continue;
		}
		return dropoffTime;
	}
	return -1;
};

bool LegalityChecker::isTrainingFlight(const Duty* duty) const {
	//bool isTraining = false;
	//long long pairingId = duty->getPairingId();
	//std::string crewId = "";
	//vector<shared_ptr<RosterFlight>> rfs = _dbData->rosterFlightMgr.getByPairingId(pairingId);
	//for (auto& rf : rfs) {
	//	if (rf->dutyId == duty->getDutyId() && rf->isTrainingFlight()) {
	//		isTraining = duty->isTrainingAddTime();
	//		break;
	//	}

	//}
	//return isTraining;
	return duty->isTrainingAddTime();
}

vector<RULE_COMPOSITION> LegalityChecker::calCompByBlock_R4(Duty* duty)
{
	DBG_HELP("LegalityChecker::calCompByBlock_R4");

	vector<RULE_COMPOSITION> result;
	//RULE_COMPOSITION* composition = new RULE_COMPOSITION();//20190418 ain, mantis#5183, clear mem leak

	int landing = 0;
	landing = duty->getNumFlySegs();

	vector<Segment *> segments = duty->getSegments();

	if (landing == 0)
	{
		for (auto& segment : segments)
		{
			string ass = segment->getAssignment();
			if (ass == "OPR" || ass == "FLY")
				landing++;
		}
	}

	string header, headeValue;
	string complement, max_blh = "9999", checkin_lower = "00:00", checkin_upper = "23:59";
	string strDefinition, strValue = "N";
	bool isAugment = false;
	vector<RULE_COMPOSITION>* rule_compositon = this->getCompositionDefinition();

	vector<DBRule> rules = this->_dbData->getRuleFunctions(RULES::MAX_BLOCK_PERDUTY_R4);
	stable_sort(rules.begin(), rules.end(), block_cmp);
	map<string, string>::const_iterator iter;

	for (auto& rule : rules)
	{
		if (rule.tableNum == 2)
			continue;
		map<string, string> parameter = rule.params;

		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "DEFINITION") {
				strDefinition = headeValue;
			}
			if (header == "VALUE") {
				strValue = headeValue;
			}
		}
		break;
	}

	long block = 0;
	map<string, int>& resBunks = RuleParams::GetInstancePtr()->rest_bunk;
	bool hasBunk = false;
	for (auto & segment : segments)
	{
		if ((strDefinition == "USEHISTORICALBLH") && (strValue == "Y"))
		{
			segment->setHistoricalBlhFlag(true);
		}
		block += segment->getBlkMinutes();
		string fleet = segment->getFleetCD();
		int i = 0;
		i = resBunks[fleet];
		if ((i >= 0) && (hasBunk || segments.size() == 1))
		{
			hasBunk = true;
		}
		else
			hasBunk = false;
	}

	//COMPOSITION,WITH_BUNK,LANDING_TIMES_LOWER,LANDING_TIMES_UPPER,AC CHANGE,MAX BLH
	string landing_upper, landing_lower, acChg, with_bunk = "*";
	for (vector<RULE_COMPOSITION>::iterator it = rule_compositon->begin(); it != rule_compositon->end(); ++it)
	{
		/*if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
		{
			if ((*it).name != RuleParams::GetInstancePtr()->basicComposition)
				continue;
		}*/

		for (size_t iRule = 0; iRule < rules.size(); iRule++)
		{
			if (rules[iRule].tableNum == 1)
				continue;
			vector<string> compositions;
			map<string, string> parameter = rules[iRule].params;
			for (iter = parameter.begin(); iter != parameter.end(); ++iter)
			{
				header = iter->first;
				headeValue = iter->second;
				if (header == "COMPOSITION") {
					complement = headeValue;
					split(complement, '|', compositions);
				}

				if (header == "WITH_BUNK") {
					with_bunk = headeValue;
				}
				if (header == "LANDING_TIMES_LOWER") {
					landing_lower = headeValue;
				}
				if (header == "LANDING_TIMES_UPPER") {
					landing_upper = headeValue;
				}
				if (header == "AC CHANGE") {
					acChg = headeValue;
				}
				if (header == "MAX BLH") {
					max_blh = headeValue;
				}
				if (header == "ISAUGMENT") {
					isAugment = (headeValue == "Y");
				}
			}

			if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
			{
				if (isAugment)
					continue;
			}

			if (find(compositions.begin(), compositions.end(), (*it).name) == compositions.end())
				continue;

			long lMaxBlock = hhmmToMinutes(max_blh.c_str());

			int iLandingLow = 0, iLandingUpper = 999;
			if (landing_lower != "")
				iLandingLow = stoi(landing_lower);
			if (landing_upper != "")
				iLandingUpper = stoi(landing_upper);

			if (!(landing >= iLandingLow && landing <= iLandingUpper))
				continue;

			if (with_bunk != "*")
			{
				if (with_bunk == "Y" && !hasBunk)
					continue;
				if (with_bunk == "N" && hasBunk)
					continue;
			}

			if (block <= lMaxBlock)
			{
				vector<RULE_COMPOSITION> ::iterator pos = std::find(result.begin(), result.end(), *it);
				if (pos == result.end())
					result.push_back(*it);
			}
		}
	}

	return result;
}

vector<RULE_COMPOSITION> LegalityChecker::calCompByBlock(Duty* duty)
{
	DBG_HELP("LegalityChecker::calCompByBlock");

	vector<RULE_COMPOSITION> result;
	//RULE_COMPOSITION* composition = new RULE_COMPOSITION();//20190418 ain, mantis#5183, clear mem leak

	time_t checkin = duty->getStartTimeUtcAct();
	string strBase = duty->getDepStation();
	auto offsetMinutes = _dbData->getAirportOffsetMinutes(strBase);
	int landing = duty->getNumFlySegs();

	//COMPOSITION,RPT START,RPT END,MAX BLH
	//2P,00:00,04:58,08:00

	string header, headeValue;
	string complement, max_blh = "9999", checkin_lower = "00:00", checkin_upper = "23:59";
	bool isAugment = false;
	//1	COMPOSITION, RPT START, RPT END, MAX BLH
	//DEFINITION,VALUE
	//USEHISTORICALBLH,Y
	string strDefinition, strValue = "N";
	vector<RULE_COMPOSITION>* rule_compositon = this->getCompositionDefinition();

	vector<DBRule> rules = this->_dbData->getRuleFunctions(RULES::MAX_BLOCK_PERDUTY);

	// use a static variable and lambda function to sort rules only once for PAIRING_OPTIMIZER

	if (this->_application != PAIRING_OPTIMIZER)
		stable_sort(rules.begin(), rules.end(), block_cmp);
	else {
		static int init = [rules = &rules]() {
			stable_sort(rules->begin(), rules->end(), block_cmp);
			return 0;
		}();
	}

	map<string, string>::const_iterator iter;

	for (size_t iRule = 0; iRule < rules.size(); iRule++)
	{
		DBRule singleRule = rules[iRule];
		if (singleRule.tableNum > 1)
			continue;
		auto& parameter = singleRule.params;

		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "DEFINITION") {
				strDefinition = headeValue;
			}
			if (header == "VALUE") {
				strValue = headeValue;
			}
		}
		break;
	}

	vector<Segment *> segments = duty->getSegments();
	long block = 0;
	for (auto & segment : segments)
	{
		if ((strDefinition == "USEHISTORICALBLH") && (strValue == "Y"))
		{
			segment->setHistoricalBlhFlag(true);
		}
		block += segment->getBlkMinutes();
	}

	for (vector<RULE_COMPOSITION>::iterator it = rule_compositon->begin(); it != rule_compositon->end(); ++it)
	{
		/*if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
		{
			if ((*it).name != RuleParams::GetInstancePtr()->basicComposition)
				continue;
		}*/

		for (size_t iRule = 0; iRule < rules.size(); iRule++)
		{
			if (rules[iRule].tableNum == 1)
				continue;

			vector<string> compositions;
			map<string, string> parameter = rules[iRule].params;
			for (iter = parameter.begin(); iter != parameter.end(); ++iter)
			{
				header = iter->first;
				headeValue = iter->second;
				
				if (header == "COMPOSITION") {
					complement = headeValue;
					split(complement, '|', compositions);
				}
				if (header == "RPT START") {
					checkin_lower = headeValue;
				}
				if (header == "RPT END") {
					checkin_upper = headeValue;
				}
				if (header == "MAX BLH") {
					max_blh = headeValue;
				}
				if (header == "ISAUGMENT") {
					isAugment = (headeValue == "Y");
				}
			}

			if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
			{
				if (isAugment)
					continue;
			}

			if (find(compositions.begin(), compositions.end(), (*it).name) == compositions.end())
				continue;

			bool isInRange = Utility::GetInstancePtr()->IsTimesInRange(checkin, offsetMinutes, checkin_lower, checkin_upper);

			if (!isInRange)
				continue;

			long lMaxBlock = hhmmToMinutes(max_blh.c_str());

			if (block <= lMaxBlock)
			{
				vector<RULE_COMPOSITION> ::iterator pos = std::find(result.begin(), result.end(), *it);
				if (pos == result.end())
					result.push_back(*it);
			}

		}
	}

	return result;
}

vector<RULE_COMPOSITION> LegalityChecker::calCompByFDP(Duty* duty)
{
	DBG_HELP("LegalityChecker::calCompByFDP");

	//RULE_COMPOSITION* composition = new RULE_COMPOSITION();//20190418 ain, mantis#5183, clear mem leak
	vector<RULE_COMPOSITION> result;

	//COMPOSITION,RPT START,RPT END,LANDING LOWER,LANDINGS UPPER,REST FACILITY,MAX FDP
	//2P,00:00,05:59,5,5,,11:00
	//COMPOSITION,RPT START,RPT END,MAX BLH
	//2P,00:00,04:58,08:00
	string complement, bunk, landing_lower = "0", landing_upper = "99", max_fdp = "9999", checkin_lower = "00:00", checkin_upper = "23:59";
	string includeCO, includeLastDHD;
	bool isCheckRule = false;
	bool isAugment = false;
	string header, headValue;

	vector<RULE_COMPOSITION>* rule_compositon = this->getCompositionDefinition();
	time_t checkin = duty->getStartTimeUtcAct();

	string strBase = duty->getDepStation();
	auto offsetMinutes = _dbData->getAirportOffsetMinutes(strBase);
	vector<DBRule> templist = this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY);

	// use a static variable and lambda function to sort rules only once for PAIRING_OPTIMIZER

	if (this->_application != PAIRING_OPTIMIZER)
		stable_sort(templist.begin(), templist.end(), fdp_cmp);
	else {
		static int init = [templist = &templist]() {
			stable_sort(templist->begin(), templist->end(), fdp_cmp);
			return 0;
		} ();
	}

	//long fdp = duty->getFDPInSecs();
	CalculationManday FDP = _dbData->getCalculationManday("FDP");
	long fdp = ::calculateDutyFdp(duty, _dbData.get(), FDP);
	int landing = 0;
	landing = duty->getNumFlySegs();

	if (landing == 0)
	{
		for (auto& segment : duty->getSegments())
		{
			string ass = segment->getAssignment();
			if (ass == "OPR" || ass == "FLY")
				landing++;
		}
	}

	for (vector<RULE_COMPOSITION>::iterator it = rule_compositon->begin(); it != rule_compositon->end(); it++)
	{
		/*if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
		{
			if ((*it).name != RuleParams::GetInstancePtr()->basicComposition)
				continue;
		}*/

		for (size_t iRule = 0; iRule < templist.size(); iRule++)
		{
			auto& parameter = templist[iRule].params;
			vector<string> compositions;

			for (auto iter = parameter.begin(); iter != parameter.end(); iter++)
			{
				header = iter->first;
				headValue = iter->second;

				if (header == "COMPOSITION") {
					complement = headValue;
					split(complement, '|', compositions);
				}
				if (header == "REST FACILITY") {
					bunk = headValue;
				}
				if (header == "LANDING LOWER") {
					landing_lower = headValue;
				}
				if (header == "LANDINGS UPPER") {
					landing_upper = headValue;
				}
				if (header == "RPT START") {
					checkin_lower = headValue;
				}
				if (header == "RPT END") {
					checkin_upper = headValue;
				}
				if (header == "MAX FDP") {
					max_fdp = headValue;
					isCheckRule = true;
				}
				if (header == "ISAUGMENT") {
					isAugment = (headValue == "Y");
				}
			}


			if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
			{
				if (isAugment)
					continue;
			}

			if (find(compositions.begin(), compositions.end(), (*it).name) == compositions.end())
				continue;

			bool isInRange = Utility::GetInstancePtr()->IsTimesInRange(checkin, offsetMinutes, checkin_lower, checkin_upper);

			if (!isInRange)
				continue;

			int iLandingLow = 0, iLandingUpper = 999, lMaxFDP = 9999;
			iLandingLow = stoi(landing_lower);
			iLandingUpper = stoi(landing_upper);
			if (!(landing <= iLandingUpper && landing >= iLandingLow))
				continue;

			//lMaxFDP是分钟
			lMaxFDP = hhmmToMinutes(max_fdp.c_str());

			map<string, int> mapComplement = duty->getComplementMap();
			string strComplement = Utility::GetInstancePtr()->getComplement(mapComplement);
			string strBase = duty->getDepStation();
			bool bIsBunk = true;

			if (fdp <= lMaxFDP * 60){

				vector<RULE_COMPOSITION> ::iterator pos = std::find(result.begin(), result.end(), *it);
				if (pos == result.end())
					result.push_back(*it);
			}
		}
	}
	return result;
}


vector<RULE_COMPOSITION> LegalityChecker::calCompByFDP_R4(Duty* duty)
{
	DBG_HELP("LegalityChecker::calCompByFDP_R4");

	//RULE_COMPOSITION* composition = new RULE_COMPOSITION();//20190418 ain, mantis#5183, clear mem leak
	vector<RULE_COMPOSITION> result;

	vector<RULE_COMPOSITION>* rule_compositon = this->getCompositionDefinition();

	auto rules = this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY_R4);
	stable_sort(rules.begin(), rules.end(), fdp_cmp);

	//long fdp = duty->getFDPInSecs();
	CalculationManday FDP = _dbData->getCalculationManday("FDP");
	long fdp = ::calculateDutyFdp(duty, _dbData.get(), FDP);
	map<string, int> mapComplement = duty->getComplementMap();
	string strComplement = Utility::GetInstancePtr()->getComplement(mapComplement);

	map<string, int>& resBunks = RuleParams::GetInstancePtr()->rest_bunk;
	bool hasBunk = false;
	for (auto& segment : duty->getSegments())
	{
		string fleet = segment->getFleetCD();
		int i = 0;
		i = resBunks[fleet];
		if ((i >= 0) && (hasBunk || duty->getSegments().size() == 1))
		{
			hasBunk = true;
		}
		else
			hasBunk = false;
	}

	string header, headValue;
	string complement, bunk = "*", max_fdp = "9999";
	bool isAugment = false;
	//COMPOSITION,WITH_BUNK,MAX FDP
	for (vector<RULE_COMPOSITION>::iterator it = rule_compositon->begin(); it != rule_compositon->end(); it++)
	{
		/*if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
		{
			if ((*it).name != RuleParams::GetInstancePtr()->basicComposition)
				continue;
		}*/
		for (size_t iRule = 0; iRule < rules.size(); iRule++)
		{
			map<string, string> parameter = rules[iRule].params;
			map<string, string>::const_iterator iter;
			vector<string> compositions;

			for (iter = parameter.begin(); iter != parameter.end(); iter++)
			{
				header = iter->first;
				headValue = iter->second;

				if (header == "COMPOSITION") {
					complement = headValue;
					split(complement, '|', compositions);
				}
				if (header == "WITH_BUNK") {
					bunk = headValue;
				}

				if (header == "MAX FDP") {
					max_fdp = headValue;
				}
				if (header == "ISAUGMENT") {
					isAugment = (headValue == "Y");
				}
			}

			if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
			{
				if (isAugment)
					continue;
			}

			if (find(compositions.begin(), compositions.end(), (*it).name) == compositions.end())
				continue;

			//lMaxFDP是分钟
			int lMaxFDP = hhmmToMinutes(max_fdp.c_str());

			if (bunk != "*")
			{
				if (bunk == "Y" && !hasBunk)
					continue;
				if (bunk == "N" && hasBunk)
					continue;
			}

			if (fdp <= lMaxFDP * 60)
			{
				vector<RULE_COMPOSITION> ::iterator pos = std::find(result.begin(), result.end(), *it);
				if (pos == result.end())
					result.push_back(*it);
			}
		}
	}
	return result;
}

//根据duty的配比得到配比名称
string LegalityChecker::getCompositionByRanks(Duty* duty)
{
	string compName;
	int maxPriority = 9999;
	vector<RULE_COMPOSITION>* rule_comps = this->getCompositionDefinition();
	vector<Segment*> segments = duty->getSegments();
	for (auto& segment : segments)
	{
		auto& fills = segment->getFillComposition();
		//map<string, int>& plans = segment->getPlanComposition();
		for (auto& rule_comp : *rule_comps)
		{
			if (rule_comp.isEqualToRankComposition(fills, this->_dbData->scenario.division != "C"))
			{
				if (rule_comp.priority < maxPriority)
				{
					compName = rule_comp.name;
					maxPriority = rule_comp.priority;
				}
			}
		}
	}
	if (compName == "")
		compName = RuleParams::GetInstancePtr()->basicComposition;
	duty->setCompositionName(compName);
	return compName;

}

//PO接口：根据FDP/BLK和DUYT/SEGMENT本身COMPOSITION信息，返回给PO最经济并合规的配比名称，如2P/3P
//并且在duty内设置该配比名称
//逻辑：
//	1. PO在3007/3008，2007/2008里检查是否存在合规的配比。并在合规的配比里返回一个最经济配比
//  2. PO在调用该接口后，无需调用2007/2008/3007/3008法规检查
bool LegalityChecker::getMinQualifiedComposition(Duty* duty, int application)
{
	//if (segments.size() == 3 && segments[0]->getDBId() == 181270 && segments[1]->getDBId() == 179644 && segments[2]->getDBId() == 179645)
	//	printf("");
	string compName;
	bool canAugmented = RuleParams::GetInstancePtr()->canAugmented;
	int prevPriority = 9999;
	/*

	vector<Segment*>& segments = duty->getSegments();
	map<string, vector<int>> openInDuty;
	//duty里最大计划配比
	int maxPriority = -1;

	//从检查法规角度来看，应该取DUTY里航班最大PLAN配比，然后和法规限制(FDP/BLK)对比
	//而从PO获取配比来看，应该取DUTY里航班最小OPEN配比
	vector<RULE_COMPOSITION>* rule_comps = this->getCompositionDefinition();
	for (auto& segment : segments)
	{
	map<string, int>& opens = segment->getOpenComposition();
	map<string, int>& plans = segment->getPlanComposition();
	for (auto& rule_comp : *rule_comps)
	{
	if (rule_comp.isEqualToRankComposition(plans, this->_dbData->scenario.division != "C"))
	{
	if (rule_comp.priority > maxPriority)
	{
	compName = rule_comp.name;
	maxPriority = rule_comp.priority;
	}
	}
	}
	}
	*/
	bool bReturn = true;;
	vector<RULE_COMPOSITION> legalCompositions = getLegalCompositions(duty);
	if (legalCompositions.size() == 0)
		return false;
	else
	{
		bool canFind = false;
		for (auto& rule_comp : legalCompositions)
		{
			if (rule_comp.name == RuleParams::GetInstancePtr()->basicComposition)
			{
				canFind = true;
			}
			if (rule_comp.priority < prevPriority)
			{
				prevPriority = rule_comp.priority;
				compName = rule_comp.name;
			}
		}
		if (!canAugmented)
		{
			compName = RuleParams::GetInstancePtr()->basicComposition;
			if (!canFind)
				bReturn = canFind;
		}
		duty->setCompositionName(compName);
	}
	return bReturn;

	/*
	if (!canAugmented)
	{
	if (compName == "")
	compName = RuleParams::GetInstancePtr()->basicComposition;
	//duty->setCompositionName(compName);
	return compName;
	}
	else if (this->_application != PAIRING_OPTIMIZER && compName == "")
	{
	compName = RuleParams::GetInstancePtr()->basicComposition;
	//duty->setCompositionName(compName);
	return compName;
	}

	map<string, map<string, vector<int>>>& coms = calculateComposition(duty);

	for (auto& rule_comp : *rule_comps)
	{
	if (coms[rule_comp.name].size() == 0)
	continue;
	if (rule_comp.priority < prevPriority)
	{
	prevPriority = rule_comp.priority;
	compName = rule_comp.name;
	}
	}
	//duty->setCompositionName(compName);
	return compName;
	*/
}

//根据duty的block时间和fdp得到所有可用的配比,map<pln,fill>
map<string, map<string, vector<int>>> LegalityChecker::calculateComposition(Duty * duty)
{

	vector<map<string, vector<int>>> result;
	map<string, map<string, vector<int>>> resultWithName;

	vector<Segment*> segments = duty->getSegments();

	//RULE_COMPOSITION composition;
	Duty::DUTY_TYPE	dt = duty->getType();
	if ((dt != Duty::DUTY_PURE_OPR) && (dt != Duty::DUTY_FLY))
		return resultWithName;

	vector<RULE_COMPOSITION> legalCompositions = getLegalCompositions(duty);
	return resultWithName;
}

void LegalityChecker::calculatePairingBriefDebrief(Pairing * pg) {
	//20181127 ain, 按顺序计算: brief/debrief -> duty.start/end -> FDP/DP/BLK/RST
	string pairingBase = pg->getBase();
	if (this->_application == PAIRING_OPTIMIZER && pg->getFirstDuty() != nullptr ) {
		pairingBase = pg->getFirstDuty()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty* duty = pg->getDuty(i);
		Duty* beforeDuty = (i == 0) ? nullptr : pg->getDuty(i - 1);
		Duty* nextDuty = ((i + 1) >= pg->getNumDuties()) ? nullptr : pg->getDuty(i + 1);
		basicSetting(duty, pairingBase, false, beforeDuty, nextDuty);//计算brief/debrief/pickup/dropoff
		duty->setActualValueByPlan(); //minBrief -> actBrief
		duty->setStartEndByBriefDebrief();
	}
	pg->setStartEndByPickupDropoff();//mantis#5333, reset pairing.start/end by pickup/dropoff
}
void LegalityChecker::calculatePairingFdpRest(Pairing * pg) {

	//7000
	//setAcclimationState(pg->getDutyVec());
	setAcclimationStateOfEASA(pg);
	setAcclimationStateByLocalNights(pg->getDutyVec());
	// 7400 ANR acclimatisation
	setAcclimationStateOfANR(pg);
	setSplitDuty(pg->getDutyVec());

	//QQ 6005
	this->setAcclimationState_QQ(pg);
	//QQ 6006
	setAirportRestFacilty_QQ(pg);

	//计算 FDP/DP/BLK/WP/REST
	BasicCalculation calc(_dbData);
	calc.setRuleEngine(this);
	calc.setCalculatedObject(pg);
	calc.calculate();
	//航班延误调整Duty的FDP等值 6022
	setPairingDutyTimesForDelayedFlight_QQ(pg);
	//20181016 ain, mantis#4139, 重算 pairing/duty bh/ft/dp/fdp/rest
	calculatePairingDutyTimes(pg, _dbData.get());
	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty* duty = pg->getDuty(i);
		duty->setPlanValueByActual();
		//op#2128 setDirection
		duty->calculateDutyValues(this->_application);

		//重新设置Duty的minBrief，暂不设置minDebrief、minPickup、minDropoff
		int minBriefTime = calculateDutyBrief(duty, pg->getBase());
		if (minBriefTime > 0) {
			duty->setMinBrief(minBriefTime);
		}
	}

	// 7481 RED_EYE_DEFINITION_FOR_HX
	setRedEyeDutyForHX(pg);

	// 7482 ACCLIMATISATION_DEFINITION_FOR_HX
	setAcclimationStateForHX(pg);

	// 7500 ACCLIMATISATION_DEFINITION_FOR_CARS
	setAcclimationStateForCARS(pg);

  	//6007
  	calculateMaxFlightDutyPeriod_QQ(pg);
  	//7410 ANR
  	calculateMaxFlightDutyPeriod_ANR(pg);
	//7484 HX
	calculateMaxFlightDutyPeriod_HX(pg);

	//6107 QQ计算maxFDP for CC 根据配置，不配置则不计算
	calculateMaxFlighTime_QQ_CC(pg);

	//7300 CALC_MAX_DUTY_TIME_FOR_PR
	setMaxDP_PR(pg);

	//7303 CALC_MAX_DP_PER_AVG_BLH_OF_CBA_FOR_PR
	setMaxDPPerAvgBLHOfCBA_PR(pg);

	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty* duty = pg->getDuty(i);

		//3007 MAX_FDP_PERDUTY 设置Max FDP
		setFDPPerDutyByDuty(duty);

		//6020 QQ计算MaxFDP by Split Duty
		setMaxFlightDutyBySplitDuty_QQ(duty);

		//7407 5J 计算Max FDP和Extension
		calculateDutyFdpAndExtensionFor5J(duty);

		calculateMaxFlightDutyPeriod_HX(duty);

		apply3021MaxFdpBriefDelta(duty, pg->getBase());
	}

	//6025 LIMIT_MAX_DP_QQ
	calculateMaxDP_QQ(pg);

	//op#2128 setDirection
	if (pg->getDivision() == "P") {

		/*setDutyDiscretion_R5(duty);
		setDutyDiscretion_R4(duty);*/
	}
	else {
		for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
			Duty* duty = pg->getDuty(i);
			setDutyDiscretion_2030(duty);
		}
	}

	//6100
	this->setDutyDiscretion2_QQ(pg);

	//6109
	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty* duty = pg->getDuty(i);
		this->setDutyDiscretion_QQ(duty);
	}

	//6105
	this->setMinRestAtBaseOrLayover_QQ(pg);

	//7021
	this->setMinRestByDP_TG(pg);

	//7022 - Pairing维度：计算尚未分配Crew的Duty的manualRestDiscretion
	// 注意：此调用在setMinRestByDP_TG之后，因为7022依赖7021设置的minRest值。
	// 对于已分配Crew的Duty，Crew维度的setMinRestReduce_TG会再次处理（幂等）。
	this->setMinRestReduce_TG(pg);

	//7023
	this->setMinRestAtLayover_TG(pg);

	//7024
	this->setMinRestAtBaseForTG(pg);

	//7100
	this->setMinRest_EvaFd(pg);

	//7488
	this->setMinRestForHX(pg);

	//7412
	this->setMinimumRestPeriodForSQRule(pg);

	//7422
	this->setAtdoAfterSlipForSQ(pg);

	//7423
	this->setPostUlrRestAtBaseForSQ(pg);

	//7424
	this->setOvernightAtdoAtBaseForSQ(pg);

	//7465
	this->setMinScheDaysOffAtBaseForSQ(pg);

	//7466
	this->setExtraDaysOffAtBaseForSQ(pg);

	//7200
	this->setCheckInMinRest_EvaFd(pg);

	//7311
	this->setMinRestByBlockTime_PR(pg);

	//7313
	this->setMaxDPByComplement_PR(pg);

	//8080
	for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::SET_MIN_REST_BY_FDP)) {
		setMinRestByFDP(pg);
	}

	//MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD(7211)
	//setMinRestAfterCumulativeFT_EvaFd(pg);

	////20190601 ain, mantis#5831, 增加2124计算 minRest, 增加 actRest=minRest
	////2124
	//for (DBRule& singleRule : _ruleFuncMap[RULES::GEN_MIN_REST]) {
	//	for (std::size_t i = 0; i < pg->getNumDuties(); i++){
	//		Duty* d = pg->getDuty(i);
	//		setMinRest(d, &singleRule);
	//		
	//	}
	//}

	//MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD(7211)
	setMinRestAfterCumulativeFT_EvaFd(pg);

	//7028 TG 计算FDP Extension
	calculateSplitDutyMaxFDPExtension_TG(pg);

	//7017 TG CC 计算FTP扩展
	calculateMaxFDPExtension_TG_CC(pg);

	//6008 FDP_AND_FT_DISCRETION_FOR_FD_QQ
	setFdpAndFtDiscretionForFd_QQ(pg);

	//6009 FDP_AND_FT_DISCRETION_FOR_CC_QQ
	setFdpAndFtDiscretionForCC_QQ(pg);

	//6111 REST_DISCRETION_QQ
	setRestDiscretion_QQ(pg);

	//REDUCE_ODP_AT_BASE_QQ(6101)
	reduceMinRestAtBase_QQ(pg);

	//REDUCE_ODP_AWAY_FROM_BASE_QQ(6102)
	reduceMinRestAwayFromBase_QQ(pg);

	//CALCULATE_STANDBY_DP_FOR_TG
	CalculatePairingStandbyDP_TG(pg);

	//7492 CALCALATE_MAX_FDP_EXTENSION_FOR_SPLIT_DUTY_FOR_HX
	setMaxFdpExtensionForSplitDutyForHX(pg);

	//7029 TG CC FDP Extension with in-flight rest
	calculateFdpExtensionWithInFlightRestOfCcForTG(pg);

	//2001 CALC_MANUAL_LIMIT
	setManualLimit(pg);

	//7307(所有计算MinRest之后最后调用)
	this->setMinRestBasedLocalNightForPR(pg);
}

//仅RuleTool使用
void LegalityChecker::calculatePairingFdpRest(RULE_LEGALITY* pCrew) {

	//TRAINING_BRIEF_AND_DEBRIEF(7228)
	calculateTrainingBriefAndDebrief(pCrew);

	SharedPtr<CREW> crew = this->_dbData->crewList[(pCrew)->crewIndex];
	vector<Duty*> tempDuties;
	(pCrew)->isLegal = checkMinRestByType(tempDuties, crew);
	(pCrew)->isLegal = (pCrew)->isLegal && checkMinRestBeforeDutyByLength(tempDuties, crew);
	(pCrew)->isLegal = (pCrew)->isLegal && checkExtendRestBeforeDuty(tempDuties, crew);
	(pCrew)->isLegal = (pCrew)->isLegal && chekcMinRestBeforeDutyByDP(tempDuties, crew);

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if ((pCrew)->RosterIndex >= 0 && (pCrew)->RosterIndex >= (int)rosters.size())
	{
		Logger::getRuleLogger()->error("[calculatePairingFdpRest] Assert Error: crew({}),roster index({}) exceeds the roster size.", (pCrew)->crewIndex, (pCrew)->RosterIndex);
	}
	setRedEyeDutyForHX(rosters);//7481
	setAcclimationStateOfEASA(rosters);//7000
	setAcclimationStateOfANR(rosters);//7400
	setAcclimationState_QQ(rosters);//6005
	setAcclimationStateForHX(rosters);//7482
	//set call additional callin standby FDP in the callin FLY roster
	calcualteCallinSbyFDP(this->_dbData, crew, RuleParams::GetInstancePtr()->getStandbyAssignments());

	//BasicCalculation calculator(this->_dbData, this->_dbData->crewList[(pCrew)->crewIndex]);
	//calculator.calculateManDays(rosters, true);

	for (size_t iRoster = 0; iRoster < rosters.size(); ++iRoster)
	{
		checkMaxGround(rosters[iRoster].get());
		if (!(rosters[iRoster]->pairing))
			continue;

		Pairing* pg = rosters[iRoster]->pairing;
		if (!(pg->isInitialized()))
		{
			vector<Duty*> dutylist = pg->getDutyVec();
			setSplitDuty(dutylist);
			for (int iDuty = 0; iDuty < (int)dutylist.size(); ++iDuty)
			{
				Duty* duty = dutylist[iDuty];
				Duty::DUTY_TYPE dt = duty->getType();
				if (dt == Duty::DUTY_BLANK_DAY || dt == Duty::DUTY_PAIRING_REST) {
					continue;
				}
				duty->calculateDutyValues(this->_application);
				//op#2163 移除duty 五件套初始化
				/*setDutyBuilderReq(duty);*/
				//op#2128 setDirection
  				if (pg->getDivision() == "P") {
  					calculateMaxFlightDutyPeriod_QQ(duty, rosters[iRoster]);
  					calculateMaxFlightDutyPeriod_ANR(duty, rosters[iRoster]);
					calculateMaxFlightDutyPeriod_HX(duty, rosters[iRoster]);
					/*setDutyDiscretion_R5(duty);
					setDutyDiscretion_R4(duty);*/
				}
				else {
					setDutyDiscretion_2030(duty);
				}
				//6006 QQ设置机场休息设施
				setAirportRestFacilty_QQ(duty);

				//3007 MAX_FDP_PERDUTY 设置Max FDP
				setFDPPerDutyByDuty(duty);

				// 6107 QQ计算maxFDP for CC 根据配置，不配置则不计算
				calculateMaxFlighTime_QQ_CC(duty);

				//6020 QQ计算MaxFDP by Split Duty
				setMaxFlightDutyBySplitDuty_QQ(duty);

				//6025 LIMIT_MAX_DP_QQ
				calculateMaxDP_QQ(duty);

				//mantis#5082 在每次进行Brief/deBrief/pickUp/dropOff赋值前 先计算DomIntype
				//duty->setDomIntType(Utility::GetInstancePtr()->getDutySegType(duty, &(this->_dbData->airportList)));
				//setDutyBrief(duty);
				//setDutyDebrief(duty);
				//setDutyPickup(duty);
				//setDutyDropoff(duty);
				//checkMinConnBetwDIP(duty);

				//7028 TG 计算FDP Extension
				calculateSplitDutyMaxFDPExtension_TG(duty);

				//7017 TG CC 计算FTP扩展
				calculateMaxFDPExtension_TG_CC(duty);

				//7407 5J 计算Max FDP和Extension
				calculateDutyFdpAndExtensionFor5J(duty);

				calculateMaxFlightDutyPeriod_HX(duty);

				apply3021MaxFdpBriefDelta(duty, pg->getBase());

				//GEN_MIN_REST
				if (iDuty == (int)dutylist.size() - 1)
					for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::GEN_MIN_REST))
						setMinRest(duty, &singleRule, iDuty, rosters[iRoster]);

				//7029 TG CC FDP Extension with in-flight rest
				calculateFdpExtensionWithInFlightRestOfCcForTG(duty);
			}
			setULR(pg);
		}

		//7021
		setMinRestByDP_TG(rosters[iRoster]);

		//7023
		setMinRestAtLayover_TG(rosters[iRoster]);

		//7024
		setMinRestAtBaseForTG(rosters[iRoster]);

		//7100
		setMinRest_EvaFd(rosters[iRoster]);

		//7488
		this->setMinRestForHX(rosters[iRoster]);

		//7412
		setMinimumRestPeriodForSQRule(rosters[iRoster]);

		////7465
		//this->setMinScheDaysOffAtBaseForSQ(rosters[iRoster]);

		////7466
		//this->setExtraDaysOffAtBaseForSQ(rosters[iRoster]);

		//7200
		setCheckInMinRest_EvaFd(rosters[iRoster]);

		//8080
		//setMinRestByFDP(pg, roster[iRoster]->callinSBY_FDPMins);
		setMinRestByFDP(pg, rosters[iRoster]);//20181027 ain, mantis4217

		//for other applications, check the basic rules, such as minimal FDP/DP/MIN REST
		//if (this->_application != ROSTER_OPTIMIZER)
		//	checkMinRest(pg);

		//pg->setInitialIndicator(true);

		//7311
		setMinRestByBlockTime_PR(rosters[iRoster]);

		//7492
		setMaxFdpExtensionForSplitDutyForHX(rosters[iRoster]);

	}

	//6024
	calculateMaxFdpForStand_QQ(rosters);

	//7022
	setMinRestReduce_TG(rosters);

	//7018
	calculateMaxFdpOnStandbyOfCc_TG(rosters);

	//7302
	calculateMaxFDPByCalloutStandbyForPR(rosters);

	//7374
	calculateMaxFDPByCalloutFor5J(rosters);

	//MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD(7211)
	setMinRestAfterCumulativeFT_EvaFd(pCrew);

	//7029 TG CC FDP Extension with in-flight rest
	calculateFdpExtensionWithInFlightRestOfCcForTG(rosters);

	//REDUCE_ODP_AT_BASE_QQ(6101)
	reduceMinRestAtBase_QQ(pCrew);

	//REDUCE_ODP_AWAY_FROM_BASE_QQ(6102)
	reduceMinRestAwayFromBase_QQ(pCrew);

	resetMinRestForOverlapRosters(crew);

	//2001 CALC_MANUAL_LIMIT
	setManualLimit(pCrew);

	//7307(所有计算MinRest之后最后调用)
	this->setMinRestBasedLocalNightForPR(pCrew);

	// =========================================================================
	// CRITICAL EXECUTION ORDER: autoConfigDutyValues() vs setAccStartAtBaseForRT()
	// See detailed explanation in RO flow (around line 3924-3940)
	// =========================================================================

	//设置Roster的DutyValue值，复制Duty级别的值到Roster级别
	//此步骤在所有Duty级别计算法规执行之后调用
	for (auto& roster : rosters) {
		roster->autoConfigDutyValues();
	}

	// 7024-2: 设置Roster级别的适应状态 (必须在autoConfigDutyValues之后调用)
	// 原因: 此规则直接设置Roster.dutyValues的accState和refTimeZone
	//       如果在autoConfigDutyValues之前调用，会被Duty级别的值覆盖
	this->setAccStartAtBaseForRT(rosters);

}

void LegalityChecker::calculatePairingMaxFdpRest(Pairing* pg) {
	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty* duty = pg->getDuty(i);
		//3007计算MaxFDP
		checkFDPPerDutyByDuty(duty);

		//3008计算MaxBLH
		checkBlockPerDutyByDuty(duty);
	}

	//7200 CHECK_MIN_REST_FOR_EVA_FD
	this->setCheckInMinRest_EvaFd(pg);
}

void LegalityChecker::calculatePairingLabel(Pairing* pg) {
	if (_dbData->scenario.airline == "SQ")
	{
		CalculatePairingLabelForSQ calcLabel(this->_dbData.get());
		calcLabel.calculate(pg, 0);
	}
}

//五个参数 singlerule/ruleId 二选一 p/d/s 三选一传入 显示rule与不同对象的错误原因
void  LegalityChecker::createPGrulesViolation(const DBRule* singleRule,long long ruleId, Pairing* p, Duty *d, Segment* s){
	stringstream ss;
	int cut = 0;
	if (p)cut++;
	if (d)cut++;
	if (s)cut++;
	if (singleRule&&ruleId){
		cout << "Did not enter a legal rule." << endl;
		return;
	}
	if (!ruleId){
		ruleId = singleRule->idRule;
	}
	if (cut > 1){
		cout << "Input is ambiguous. Enter more than one item." << endl;
		return;
	}
	else if (!cut){
		cout << "Did not enter the correct object." << endl;
		return;
	}
	else{
		if (p){
			cout << "PairingId : " + p->getDbId();
			cout << "break RuleId : " + ruleId << endl;
			return;
		}
		if (d){
			cout << "DutyId : " + d->getDutyId();
			cout << "break RuleId : " + ruleId << endl;
			return;
		}
		if (s){
			cout << "SegmentId : " + s->getSegmentId();
			cout << "break RuleId : " + ruleId << endl;
			return;
		}
	}
};

void LegalityChecker::recordOptimizerRuleFailureById(long long ruleId)
{
	if (this->GetApplication() != PAIRING_OPTIMIZER) {
		return;
	}
	RuleStatistics::GetInstancePtr()->addOptimizerViolatedTimes(ruleId);
}

void LegalityChecker::recordOptimizerRuleFailureByFunction(unsigned int ruleFunction)
{
	if (this->GetApplication() != PAIRING_OPTIMIZER) {
		return;
	}
	RuleStatistics::GetInstancePtr()->addOptimizerViolatedTimesByFunction(ruleFunction);
}

bool LegalityChecker::checkPGRules(Pairing * pg, vector<int> rules, int application)
{
	//if (pg->getDbId() == 26262257)
	//	printf("");
	bool bRetu = true;
	cleanViolations();
	bool isLegal;
	vector<int> checkRules;
	if (rules.size() == 0)
	{
		vector<DBRule>& dbRules = _dbData->ruleList;
		for (auto& rule : dbRules)
		{
			//segment & duty rules
			//if (rule.classType == "D" || rule.classType == "S")
			{
				if (std::find(checkRules.begin(), checkRules.end(), rule.function) == checkRules.end())
					checkRules.push_back(rule.function);
			}
		}
	}
	else
	{
		for (auto& rule : rules)
		{
			checkRules.push_back(rule);
		}
	}
	// 7481 RED_EYE_DEFINITION_FOR_HX
	setRedEyeDutyForHX(pg);

	//7000
	//setAcclimationState(pg->getDutyVec());
	setAcclimationStateOfEASA(pg);
	setAcclimationStateByLocalNights(pg->getDutyVec());
	// 7400 ANR acclimatisation
	setAcclimationStateOfANR(pg);
	setSplitDuty(pg->getDutyVec());
	setULR(pg);
	
	if (this->_application == PAIRING_OPTIMIZER || this->_application == PAIRING_EDITOR  || this->_dbData->scenarioId == 0) {
		/*
		 * Without clearing limits cached on duty, wrong limitation (without pairing info) may be used in pairing check
		 */
		for (auto duty : pg->getDutyVec()) {
			duty->setMinRest(0, true);
			duty->setMinRestAtBase(0, true);
			duty->setMinATDO(0, true);
			duty->setMinEXDO(0, true);
			duty->clearLimitation();
			for (auto seg : duty->getSegments()) {
				seg->clearArrStationRestFacilty();
			}
		}
	}

	//QQ 6005
	setAcclimationState_QQ(pg);
	// 7482 ACCLIMATISATION_DEFINITION_FOR_HX
	setAcclimationStateForHX(pg);
	// 7500 ACCLIMATISATION_DEFINITION_FOR_CARS
	setAcclimationStateForCARS(pg);
    //QQ 6006
    setAirportRestFacilty_QQ(pg);
  	//QQ 6007
    calculateMaxFlightDutyPeriod_QQ(pg);
  	//7410 ANR
    calculateMaxFlightDutyPeriod_ANR(pg);
	//7484 HX
	calculateMaxFlightDutyPeriod_HX(pg);
	// 6107 QQ计算maxFDP for CC 根据配置，不配置则不计算
	calculateMaxFlighTime_QQ_CC(pg);

	//7300 CALC_MAX_DUTY_TIME_FOR_PR
	setMaxDP_PR(pg);

	//7303 CALC_MAX_DP_PER_AVG_BLH_OF_CBA_FOR_PR
	setMaxDPPerAvgBLHOfCBA_PR(pg);

	//7490
	setMaxFdpExtensionForHX(pg);

	//7491
	setMaxFdpExtensionForCcForHX(pg);

	//7492
	setMaxFdpExtensionForSplitDutyForHX(pg);
	
    for (auto& duty: pg->getDutyVec()) {
		//3007 MAX_FDP_PERDUTY 设置Max FDP
		setFDPPerDutyByDuty(duty);

		//QQ 6020 (must be after 6007)
		setMaxFlightDutyBySplitDuty_QQ(duty);

		//7407 5J 计算Max FDP和Extension
		calculateDutyFdpAndExtensionFor5J(duty);
    }
	//6025
	calculateMaxDP_QQ(pg);
	// QQ 6038
	// Added by Aspen on 2024.8.7 to calculate Adaption peirod of pairing that reached the max consecutive duty
	checkAdaptionPeriod4MaxConsecutiveDuty(pg);

	//Pairing Rules
	//8096
	if (std::find(checkRules.begin(), checkRules.end(), RULES::LQ_MAX_FDP) != checkRules.end())
	{
		setMaxFDPByTimes(pg->getDutyVec());
	}

	//7028 TG 计算FDP Extension
	calculateSplitDutyMaxFDPExtension_TG(pg);

	//7017 TG CC 计算FTP扩展
	calculateMaxFDPExtension_TG_CC(pg);

	//MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD(7211)
	setMinRestAfterCumulativeFT_EvaFd(pg);

	//6100 CALCULATION_OF_OFF_DUTY_PERIOD
	if (std::find(checkRules.begin(), checkRules.end(), RULES::CALCULATION_OF_OFF_DUTY_PERIOD) != checkRules.end()) {
		this->setDutyDiscretion2_QQ(pg);
	}

	//6109 MIN_OFF_DUTY_PERIOD_FOR_CC
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MIN_OFF_DUTY_PERIOD_FOR_CC) != checkRules.end()) {
		this->setDutyDiscretion_QQ(pg);
	}

	//6105 MIN_REST_AT_BASE_OR_LAYOVER_STATION
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MIN_REST_AT_BASE_OR_LAYOVER_STATION) != checkRules.end()) {
		this->setMinRestAtBaseOrLayover_QQ(pg);
	}

	//6008 FDP_AND_FT_DISCRETION_FOR_FD_QQ
	if (std::find(checkRules.begin(), checkRules.end(), RULES::FDP_AND_FT_DISCRETION_FOR_FD_QQ) != checkRules.end()) {
		this->setFdpAndFtDiscretionForFd_QQ(pg);
	}

	//6009 FDP_AND_FT_DISCRETION_FOR_CC_QQ
	if (std::find(checkRules.begin(), checkRules.end(), RULES::FDP_AND_FT_DISCRETION_FOR_CC_QQ) != checkRules.end()) {
		this->setFdpAndFtDiscretionForCC_QQ(pg);
	}

	//6111 REST_DISCRETION_QQ
	if (std::find(checkRules.begin(), checkRules.end(), RULES::REST_DISCRETION_QQ) != checkRules.end()) {
		this->setRestDiscretion_QQ(pg);
	}

	//7021 MIN_REST_BY_DP_FOR_TG
	this->setMinRestByDP_TG(pg);

	//7022 CALCULATE_REDUCE_REST_FOR_TG - Pairing维度
	this->setMinRestReduce_TG(pg);

	//7023 CALC_MIN_REST_AT_LAYOVER_FOR_TG
	this->setMinRestAtLayover_TG(pg);

	//7024 CHECK_MIN_REST_AT_BASE_FOR_TG
	this->setMinRestAtBaseForTG(pg);

	//7100 MIN_REST_FOR_EVA_FD
	this->setMinRest_EvaFd(pg);

	//7488 CALCULATE_MIN_REST_FOR_HX
	this->setMinRestForHX(pg);

	//7412 CHECK_MINIMUM_REST_PERIOD_FOR_SQ
	this->setMinimumRestPeriodForSQRule(pg);

	//7422 SQ CA CAI/IST short slip ATDO on return to base
	this->setAtdoAfterSlipForSQ(pg);

	//7423 CALC_POST_ULR_REST_AT_BASE_FOR_SQ
	this->setPostUlrRestAtBaseForSQ(pg);

	//7424 SQ overnight arrival ATDO at base
	this->setOvernightAtdoAtBaseForSQ(pg);

	//7465 CALC_MIN_SCHEDULE_DAYS_OFF_AT_BASE_FOR_SQ
	this->setMinScheDaysOffAtBaseForSQ(pg);

	//7466 CALC_EXTRA_DAYS_OFF_AT_BASE_FOR_SQ
	this->setExtraDaysOffAtBaseForSQ(pg);

	//7200 CHECK_MIN_REST_FOR_EVA_FD
	this->setCheckInMinRest_EvaFd(pg);

	//8080
	this->setMinRestByFDP(pg);

	//7311
	this->setMinRestByBlockTime_PR(pg);

	//7313
	this->setMaxDPByComplement_PR(pg);

	//7029 TG CC FDP Extension with in-flight rest
	calculateFdpExtensionWithInFlightRestOfCcForTG(pg);

	//2001 CALC_MANUAL_LIMIT
	setManualLimit(pg);

	//7307 MIN_REST_BASED_LOCAL_NIGHT_FOR_PR (所有计算MinRest之后最后调用)
	this->setMinRestBasedLocalNightForPR(pg);

	//7490
	this->setMaxFdpExtensionForHX(pg);

	//REST_BY_TYPE(8093)
	if (std::find(checkRules.begin(), checkRules.end(), RULES::REST_BY_TYPE) != checkRules.end())
	{
		//8093在Pairing时，仅用于设置minRest
		vector<Duty*> duties = pg->getDutyVec();
		checkMinRestByType(duties, NULL);
	}

	//0000 最后计算
	calculateGeneralRule(pg);

	//8091
	auto cit = _dbData->systemParamMap.find("COMPOSITION_MODE");
	if (cit == _dbData->systemParamMap.end() || cit->second != "FLIGHT") {
		if (std::find(checkRules.begin(), checkRules.end(), RULES::RANK_POSITION_COMB) != checkRules.end() && _dbData->version == 3)
		{
			for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::RANK_POSITION_COMB)) {
				isLegal = checkRankCombination(pg, &singleRule);
				if (!isLegal && this->GetApplication() == PAIRING_OPTIMIZER) {
					recordOptimizerRuleFailureById(singleRule.idRule);
					return false;
				}
			}
			dumpViolations(pg, RULES::RANK_POSITION_COMB);
		}
	}

	calculateMinimumLegalComplements(pg);

	//8101
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MIN_REST_IN_XHOURS_R5) != checkRules.end())
	{
		isLegal = checkMinRestIn7Days_R5(pg);
		if (!isLegal && this->GetApplication() == PAIRING_OPTIMIZER)
		{
			return false;
		}
		dumpViolations(pg, RULES::MIN_REST_IN_XHOURS_R5);
	}
	//2003
	if (std::find(checkRules.begin(), checkRules.end(), RULES::PAIRING_LIMITATION) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::PAIRING_LIMITATION))
		{
			isLegal = checkPairingLimitation(pg, &singleRule);
			if (!isLegal && this->GetApplication() == PAIRING_OPTIMIZER)
			{
				recordOptimizerRuleFailureById(singleRule.idRule);
				return false;
			}
		}
		dumpViolations(pg, RULES::PAIRING_LIMITATION);
	}
	//2032
	if (std::find(checkRules.begin(), checkRules.end(), RULES::PAIRING_MIN_REST_IN_XHOURS) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::PAIRING_MIN_REST_IN_XHOURS))
		{
			isLegal = checkPairingMinRest(pg, &singleRule);
			if (!isLegal && this->GetApplication() == PAIRING_OPTIMIZER)
			{
				recordOptimizerRuleFailureById(singleRule.idRule);
				return false;
			}
		}
		dumpViolations(pg, RULES::PAIRING_MIN_REST_IN_XHOURS);
	}

	//8033
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_CONSECUTIVE_EARLY_DUTY) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::MAX_CONSECUTIVE_EARLY_DUTY))
		{
			isLegal = checkMaxConsecutiveEarlyDutyForPairing(pg, &singleRule);
			if (!isLegal && this->GetApplication() == PAIRING_OPTIMIZER)
			{
				recordOptimizerRuleFailureById(singleRule.idRule);
				return false;
			}
		}
		dumpViolations(pg, RULES::MAX_CONSECUTIVE_EARLY_DUTY);
	}

	//7414 ANR consecutive special duty rest requirement
	// (moved below: new-rule style, no legacy dumpViolations)

	//EASA 7005
	isLegal = checkEASAMaxFDP(pg->getDutyVec(), this->_dbData->getRuleFunctions(RULES::EASA_MAX_FDP_ACCM));
	if (!isLegal && this->GetApplication() == PAIRING_OPTIMIZER)
	{
		return false;
	}
	dumpViolations(pg, RULES::EASA_MAX_FDP_ACCM);


	//CHECK_SEG_RESTRICT_FOR_EVA_FD（7203）
	isLegal = checkSegmentRestrictionForEvaFd(pg);
	if (!isLegal && this->GetApplication() == PAIRING_OPTIMIZER)
	{
		return false;
	}
	dumpViolations(pg, RULES::CHECK_SEG_RESTRICT_FOR_EVA_FD);


	//CHECK_GENDER_ON_FLIGHT_BY_COMPOSITION_FOR_PR（7314）
	isLegal = checkGenderOnFlightByCompositionForPR(pg);
	if (!isLegal && this->GetApplication() == PAIRING_OPTIMIZER)
	{
		return false;
	}
	dumpViolations(pg, RULES::CHECK_GENDER_ON_FLIGHT_BY_COMPOSITION_FOR_PR);

	if (std::find(checkRules.begin(), checkRules.end(), RULES::GEN_MIN_REST) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::GEN_MIN_REST)) {

			setMinRest(pg, &singleRule);

		}
	}

	bool bRuleLegal = true;
	if (std::find(checkRules.begin(), checkRules.end(), RULES::RESTRICT_MID_DUTY_BASE_TURN) != checkRules.end()) {
		isLegal = checkRestrictMidDutyBaseTurn_SQ(pg);
		if (!isLegal) {
			bRuleLegal = false;
			if (this->GetApplication() == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureByFunction(RULES::RESTRICT_MID_DUTY_BASE_TURN);
				return false;
			}
		}
	}
	vector<Duty*> duties = pg->getDutyVec();
	bRuleLegal = checkPGRules(duties, checkRules);
	if (!bRuleLegal)
	{
		if (this->GetApplication() == PAIRING_OPTIMIZER){
			return false;
		}
		dumpViolations(pg, RULES::LONG_TRANSIT_LIMITATION);
	}

	//// 6111 REST_DISCRETION_QQ
	//if (std::find(checkRules.begin(), checkRules.end(), RULES::REST_DISCRETION_QQ) != checkRules.end())
	//{
	//	isLegal = checkRestDiscretion_QQ(pg);
	//	if (!isLegal)
	//	{
	//		if (this->GetApplication() == PAIRING_OPTIMIZER) {
	//			return false;
	//		}
	//		dumpViolations(pg, 0);
	//	}
	//}

	//// 6008 FDP_AND_FT_DISCRETION_FOR_FD_QQ
	//if (std::find(checkRules.begin(), checkRules.end(), RULES::FDP_AND_FT_DISCRETION_FOR_FD_QQ) != checkRules.end())
	//{
	//	isLegal = checkFdpAndFtDiscretionForFd_QQ(pg);
	//	if (!isLegal)
	//	{
	//		if (this->GetApplication() == PAIRING_OPTIMIZER) {
	//			return false;
	//		}
	//		dumpViolations(pg, 0);
	//	}
	//}

	//// 6009 FDP_AND_FT_DISCRETION_FOR_CC_QQ
	//if (std::find(checkRules.begin(), checkRules.end(), RULES::FDP_AND_FT_DISCRETION_FOR_CC_QQ) != checkRules.end())
	//{
	//	isLegal = checkFdpAndFtDiscretionForCC_QQ(pg);
	//	if (!isLegal)
	//	{
	//		if (this->GetApplication() == PAIRING_OPTIMIZER) {
	//			return false;
	//		}
	//		dumpViolations(pg, 0);
	//	}
	//}

	//8097 should be called after all max fdp rules
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_FDP_EXTENSION) != checkRules.end())
	{
		setMaxFDPByExtension(pg->getDutyVec());
	}

	if (std::find(checkRules.begin(), checkRules.end(), RULES::ULR_REST_CHECK) != checkRules.end()) 
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::ULR_REST_CHECK))
		{
			isLegal = checkULRRestForPairing(pg, &singleRule);
			if (!isLegal && this->GetApplication() == PAIRING_OPTIMIZER)
			{
				recordOptimizerRuleFailureById(singleRule.idRule);
				return false;
			}
		}
		dumpViolations(pg, RULES::ULR_REST_CHECK);
	}

	//EASA rest rule 7026
	if (std::find(checkRules.begin(), checkRules.end(), RULES::EASA_REST_PERIODS) != checkRules.end()) {
		isLegal = checkEASAMinRest(pg);
		if (!isLegal)
		{
			if (this->GetApplication() == PAIRING_OPTIMIZER) {
				return false;
			}
			dumpViolations(pg, RULES::EASA_REST_PERIODS);
		}
	}

	//EASA rest rule 7027
	if (std::find(checkRules.begin(), checkRules.end(), RULES::EASA_REST_LNS) != checkRules.end()) {
		isLegal = checkEASAMinRestLN(pg);
		if (!isLegal)
		{
			if (this->GetApplication() == PAIRING_OPTIMIZER) {
				return false;
			}
			dumpViolations(pg, RULES::EASA_REST_LNS);
		}
	}
	
	//8115
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_CONSECUTIVE_DUTY_DAYS_R6) != checkRules.end())
	{

		isLegal = this->checkMaxConsecutiveDuty_R6(pg->getDutyVec());
		if (!isLegal)
		{
			recordOptimizerRuleFailureByFunction(8115);
			return false;
		}

		dumpViolations(pg, RULES::MAX_CONSECUTIVE_DUTY_DAYS_R6);
	}

	// new rules from here do not dump violations (legacy)

	//7414 ANR consecutive special duty rest requirement
	isLegal = checkAnrConsecutiveSpecialDuty_ANR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7414);
		return false;
	}

	//7415 ANR consecutive working day limit between days off
	isLegal = checkAnrDayOffSpacing_ANR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7415);
		return false;
	}

	//7416 ANR minimum days off in consecutive periods
	isLegal = checkAnrMinDayOffInPeriod_ANR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7416);
		return false;
	}

	//7417 ANR reporting + debrief minimum requirements
	isLegal = checkAnrReportingDebrief_ANR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7417);
		return false;
	}

	//3003(LIMIT_DEP_OR_ARR_STATION_FOR_PAIRING)
	isLegal = checkDepOrArrStationForPairing(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(3003);
		return false;
	}

	//QQ 6120(CHECK_OFF_DUTY_PERIOD_FOR_QQ)
	isLegal = checkOffDutyPeriodForQQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(6120);
		return false;
	}

	//QQ 6018
    isLegal = checkLongTransit_QQ(pg);
    if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
        recordOptimizerRuleFailureByFunction(6018);
        return false;
    }

	//QQ 6019
    isLegal = checkTransitAndLayover_QQ(pg);
    if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
        recordOptimizerRuleFailureByFunction(6019);
        return false;
    }

	//QQ 6020
	isLegal = checkMaxFlightDutyBySplitDuty_QQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(6020);
		return false;
	}

	//QQ 6021
	isLegal = checkAircraftChange_QQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(6021);
		return false;
	}

	//PR 7360(CHECK_AIRCRAFT_CHANGE_ALERT_FOR_PR)
	isLegal = checkAircraftChangeAlertForPR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7360);
		return false;
	}

	//PR 7362(LIMIT_AREA_ENTRY_COUNT_FOR_PR)
	isLegal = checkAreaEntryCountForPR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		return false;
	}

	isLegal = CheckSingleDutyPerDay(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		return false;
	}

	//CA 7435
	isLegal = checkUlrStandbyMinPairingDays_SQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7435);
		return false;
	}

	//CA 7420
	isLegal = checkAcopFdpPatternTableA_SQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7420);
		return false;
	}

	//CA 7421
	isLegal = checkAcopSlipPatternTableB_SQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7421);
		return false;
	}

	//SQ 7451
	isLegal = checkRestrictCoterminalDutyConnection_SQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7451);
		return false;
	}

	//SQ 7452
	isLegal = checkUlrFdpClassificationMismatch_SQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7452);
		return false;
	}

	//SQ 7453
	isLegal = checkSameCityAroundUlrDuty_SQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7453);
		return false;
	}

	//SQ 7463(LIMIT_SWINGBACK_FOR_SQ)
	isLegal = checkSwingbackForSQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7463);
		return false;
	}

	//SQ 7464(LIMIT_TRANSPORT_LENGTH_FOR_SQ)
	isLegal = checkTransportLengthForSQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7464);
		return false;
	}

	//SQ 7467(LIMIT_REST_TIME_BETWEEN_FLIGHTS_FOR_SQ)
	isLegal = checkRestTimeBetweenFlightsForSQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7467);
		return false;
	}

	//SQ 7468(LIMIT_POSITIONING_IN_COP_FOR_SQ)
	isLegal = checkLimitPositioningInCopForSQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7468);
		return false;
	}

	//QQ 6025
	isLegal = checkMaxDP_QQ(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(6025);
		return false;
	}

	//EvaFD 7200(CHECK_MIN_REST_FOR_EVA_FD)
	isLegal = checkMinRestForEvaFd(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7200);
		return false;
	}

	//EvaFD 7265(CHECK_SCH_MIN_REST_FOR_EVA_FD)
	isLegal = checkSchMinRestForEvaFd(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7265);
		return false;
	}

	//EvaFD 7266(CHECK_SCH_MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD)
	isLegal = checkSchMinRestAfterCumulativeFT_EvaFd(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7266);
		return false;
	}

	//EvaFD 7205(CHECK_MAX_BLH_IN_PERIOD_FOR_EVA_FD)
	isLegal = checkMaxBLHInPeriodForEvaFd(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7205);
		return false;
	}


	//EvaFD 7212(MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD)
	isLegal = checkMinWOCLAtLayoverStationForEvaFd(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7212);
		return false;
	}

	//EvaFD 7267(SCH_MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD)
	isLegal = checkSchMinWOCLAtLayoverStationForEvaFd(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7267);
		return false;
	}

	isLegal = CheckNightRestPeriodForEva(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		return false;
	}

	//EvaFD 7214(LAYOVER_REST_LIMIT_BY_TIME_ZONE_FOR_EVA_FD)
	isLegal = checkLayoverRestLimitByTimeZoneForEvaFd(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7214);
		return false;
	}

	//7221 DISALLOW_IMPLAUSIBLE_CONNECTIONS
	isLegal = CheckImplausibleConnectionsForPairing(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7221);
		return false;
	}

	isLegal = CheckMaxLayoversInTripsForPairing(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		return false;
	}

	//7227
	isLegal = checkLayoverRestriction(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7227);
		return false;
	}

	//7264 CHECK_SCH_TIME_ABNL_FOR_EVA_FD
	isLegal = checkSchTimeAbnormality(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7264);
		return false;
	}

	//7307 MIN_REST_BASED_LOCAL_NIGHT_FOR_PR
	isLegal = checkMinRestBasedLocalNightForPR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7307);
		return false;
	}

	//7311 CALC_MIN_REST_BY_BLH_PR
	isLegal = checkMinRestByBlockTime_PR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7311);
		return false;
	}

	//7323 CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_PR
	isLegal = checkMinSpaceBetweenDutyForPR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7323);
		return false;
	}

	//7504 CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_F8
	isLegal = checkMinSpaceBetweenDutyForF8(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7504);
		return false;
	}

	//7410 (checkMaxFlightDutyPeriod_ANR)
	isLegal = checkMaxFlightDutyPeriod_ANR(pg);
	if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
		recordOptimizerRuleFailureByFunction(7410);
		return false;
	}

    //7412 (CHECK_MINIMUM_REST_FOR_SQ)
    isLegal = checkMinimumRestPeriodForSQRule(pg);
    if (!isLegal && GetApplication() == PAIRING_OPTIMIZER) {
        recordOptimizerRuleFailureByFunction(7412);
        return false;
    }

	calculatePICForEva(pg);

	//0000 最后计算
	//calculateGeneralRule(pg);

	//check general rule, Rule 0000 必须最后做检查
	isLegal = checkGeneralRule(pg);
	if (!isLegal)
	{
		if (this->GetApplication() == PAIRING_OPTIMIZER) {
			return false;
		}
		//dumpViolations(pg, 0);
	}
	return bRetu;
}



//2032
bool LegalityChecker::checkPairingMinRest(vector<Duty*> dutyVec, const DBRule* singleRule){
	bool bReturn = true;
	auto& parameter = singleRule->params;

	string header, headeValue;
	string minLimits, period, unit, utilizeSpecialDutyTypeAsRest;
	bool isUtilizeLayover = false;
	//MIN LIMITS,PERIOD,UNIT,UTILIZE LAYOVER,UTILIZE SPECIAL DUTY TYPE AS REST
	for (auto iter = parameter.begin(); iter != parameter.end(); iter++){
		header = iter->first;
		headeValue = iter->second;
		if (header == "MIN LIMITS"){
			minLimits = headeValue;
		}
		else if (header == "PERIOD"){
			period = headeValue;
		}
		else if (header == "UNIT"){
			unit = headeValue;
		}
		else if (header == "UTILIZE LAYOVER"){
			isUtilizeLayover = (headeValue == "Y");
		}
		else if (header == "UTILIZE SPECIAL DUTY TYPES AS REST"){
			utilizeSpecialDutyTypeAsRest = headeValue;
		}
	}
	vector<string> strRestDutyType;
	split(utilizeSpecialDutyTypeAsRest, '|', strRestDutyType);
	//boost::split(strRestDutyType, utilizeSpecialDutyTypeAsRest, boost::is_any_of("|"), boost::token_compress_on);
	int iPeriod = stoi(period);
	int iMinRest = 0;
	std::size_t iPos = minLimits.find(":");
	if (iPos != string::npos)
		iMinRest = stoi(minLimits.substr(0, iPos)) * 3600 + stoi(minLimits.substr(iPos + 1)) * 60;
	else
		return true;

	time_t sumTime = 0;//20200328 ain, init var
	if (unit == "CD"){
		sumTime = 24 * 3600 * iPeriod;
	}
	int offsetMinutes = 0;
	string base;
	if (dutyVec[0]->getBase().empty()){
		base = _dbData->scenario.bases[0];
	}
	else{
		base = dutyVec[0]->getBase();
	}
	if (_dbData->scenario.airline == "BR"){
		offsetMinutes = _dbData->getAirportOffsetMinutes("TPE");
	}
	else if (!base.empty() || _dbData->scenario.airline != "BR"){
		offsetMinutes = _dbData->getAirportOffsetMinutes(base);
	}

	long long firstDytyStart = 0;
	for (auto duty : dutyVec){
		if (std::find(strRestDutyType.begin(), strRestDutyType.end(), duty->getTypeStr()) != strRestDutyType.end()){
			continue;
		}
		if (firstDytyStart == 0){
			firstDytyStart = duty->getStartTimeUtcAct();
			break;
		}
	}
	if (firstDytyStart == 0)
		return true;

	time_t actTestStartTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(firstDytyStart - iMinRest, offsetMinutes);
	time_t preDutyEndTIme = 0;//20200328 ain, init var
	while (actTestStartTime < dutyVec[dutyVec.size() - 1]->getEndTimeUtcAct())
	{
		bool isRestCheck = false;
		time_t actTestEndTime = actTestStartTime + sumTime;
		preDutyEndTIme = actTestStartTime;
		std::size_t i;
		for (i = 0; i < dutyVec.size(); i++){
			if (actTestStartTime > dutyVec[i]->getStartTimeUtcAct() || std::find(strRestDutyType.begin(), strRestDutyType.end(), dutyVec[i]->getTypeStr()) != strRestDutyType.end()){
				continue;
			}
			if (actTestEndTime <= dutyVec[i]->getStartTimeUtcAct()){
				if (actTestEndTime - preDutyEndTIme >= iMinRest){
					isRestCheck = true;
				}
				break;
			}
			if (dutyVec[i]->getStartTimeUtcAct() - preDutyEndTIme >= iMinRest){
				isRestCheck = true;
				break;
			}
			else{
				preDutyEndTIme = dutyVec[i]->getEndTimeUtcAct();
			}

		}
		if (i >= dutyVec.size() - 1 && actTestEndTime - preDutyEndTIme >= iMinRest){
			isRestCheck = true;
		}
		actTestStartTime += 3600 * 24;
		bReturn = isRestCheck;
		if (!bReturn){
			bReturn = false;
			break;
		}
	}

	return bReturn;

}

bool LegalityChecker::checkPairingMinRest(Pairing * pPairing, const DBRule* singleRule){
	bool bReturn = true;
	auto& parameter = singleRule->params;


	string header, headeValue;
	string minLimits, period, unit, utilizeSpecialDutyTypeAsRest;
	bool isUtilizeLayover;
	//MIN LIMITS,PERIOD,UNIT,UTILIZE LAYOVER,UTILIZE SPECIAL DUTY TYPE AS REST
	for (auto iter = parameter.begin(); iter != parameter.end(); iter++){
		header = iter->first;
		headeValue = iter->second;
		if (header == "MIN LIMITS"){
			minLimits = headeValue;
		}
		else if (header == "PERIOD"){
			period = headeValue;
		}
		else if (header == "UNIT"){
			unit = headeValue;
		}
		else if (header == "UTILIZE LAYOVER"){
			isUtilizeLayover = (headeValue == "Y");
		}
		else if (header == "UTILIZE SPECIAL DUTY TYPES AS REST"){
			utilizeSpecialDutyTypeAsRest = headeValue;
		}
	}
	vector<Duty*> dutyVec = pPairing->getDutyVec();
	vector<string> strRestDutyType;
	split(utilizeSpecialDutyTypeAsRest, '|', strRestDutyType);
//	boost::split(strRestDutyType, utilizeSpecialDutyTypeAsRest, boost::is_any_of("|"), boost::token_compress_on);
	int iPeriod = stoi(period);
	int iMinRest = 0;
	std::size_t iPos = minLimits.find(":");
	if (iPos != string::npos)
		iMinRest = stoi(minLimits.substr(0, iPos)) * 3600 + stoi(minLimits.substr(iPos + 1)) * 60;
	else
		return true;

	long long sumTime = 0;
	if (unit == "CD"){
		sumTime = 24 * 3600 * iPeriod;
	}
	int offsetMinutes = 0;
	string base;
	if (pPairing->getBase().empty()){
		base = _dbData->scenario.bases[0];
	}
	else{
		base = pPairing->getBase();
	}
	if (_dbData->scenario.airline == "BR"){
		offsetMinutes = _dbData->getAirportOffsetMinutes("TPE");
	}
	else if (!base.empty() || _dbData->scenario.airline != "BR"){
		offsetMinutes = _dbData->getAirportOffsetMinutes(base);
	}

	time_t firstDytyStart = 0;
	for (auto duty : dutyVec){
		if (std::find(strRestDutyType.begin(), strRestDutyType.end(), duty->getTypeStr()) != strRestDutyType.end()){
			continue;
		}
		if (firstDytyStart == 0){
			firstDytyStart = duty->getStartTimeUtcAct();
			break;
		}
	}
	if (firstDytyStart == 0)
		return true;

	time_t actTestStartTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(firstDytyStart - iMinRest, offsetMinutes);
	time_t preDutyEndTIme = 0;
	while (actTestStartTime < dutyVec[dutyVec.size() - 1]->getEndTimeUtcAct())
	{
		bool isRestCheck = false;
		long long actTestEndTime = actTestStartTime + sumTime;
		preDutyEndTIme = actTestStartTime;
		std::size_t i;
		for (i = 0; i < dutyVec.size(); i++){
			if (actTestStartTime > dutyVec[i]->getStartTimeUtcAct() || std::find(strRestDutyType.begin(), strRestDutyType.end(), dutyVec[i]->getTypeStr()) != strRestDutyType.end()){
				continue;
			}
			if (actTestEndTime <= dutyVec[i]->getStartTimeUtcAct()){
				if (actTestEndTime - preDutyEndTIme >= iMinRest){
					isRestCheck = true;
				}
				break;
			}
			if (dutyVec[i]->getStartTimeUtcAct() - preDutyEndTIme >= iMinRest){
				isRestCheck = true;
				break;
			}
			else{
				preDutyEndTIme = dutyVec[i]->getEndTimeUtcAct();
			}

		}
		if (i >= dutyVec.size() - 1 && actTestEndTime - preDutyEndTIme >= iMinRest){
			isRestCheck = true;
		}
		actTestStartTime += 3600 * 24;
		bReturn = isRestCheck;
		if (!bReturn){
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			string errorMsg = "For the period from " + utcToUtcString(actTestStartTime) + " to " + utcToUtcString(actTestStartTime + sumTime);
			errorMsg += period + " " + unit + " is less than the minimum " + minLimits + " minutes.";
			setLegalityMessage(pPairing, singleRule, errorMsg);
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = pPairing->getDbId();
			rv->startDTUtc = pPairing->getStartTimeUtc();
			rv->endDTUtc = pPairing->getEndTimeUtc();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->violation_msg = errorMsg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
			break;
		}
	}

	return bReturn;
}

/*
1. RULE提供三个接口给PO检查法规，分别基于SEGMENT/DUTY/PAIRING三个层次，前两个是Vector对象，pairing是单个对象。
Vector里Segment/duty对象都是属于一个Duty或者Pairing。
每个接口都支持调用者指定检查法规列表。指定检查法规列表如不设置，缺省为检查所有该层次法规。
2. 法规表Rule增加一个字段SUB_CLASS，表示法规属性，标明该法规为：R - Rostr；P - Pairing；D - Duty；S - Segment。而且该字段支持复合属性，如DS。
该属性无需显示在界面，仅仅在初始化时添加，后续由管理员修改，用户无需维护。
3. PO/RULE利用上述属性过滤法规。Segment接口仅仅检查Segment法规，Duty/Pairing法规也是如此。
如果Pairing接口，PO在调用时不指定检查法规列表，RULE将检查所有PAIRING/DUTY/SEGMENG法规。
4. PO根据自身逻辑和效率考虑，通过上述接口实现在运行时刻仅仅检查特定或全部法规。

2018.5.23
2.上述3条暂时修改成向下兼容检查法规，也就是调用Duty接口，自动检查SEGMENT（如果存在比如2109）
3.TODO-每个PO法规函数修改成 XXXX(vector<Segment/Duty *> objects, const DBRule* singleRule)形式??????
*/
bool LegalityChecker::checkPGRules(vector<Segment *>& segments, vector<int> rules)
{
	///TEST
	//printf("checkPGRules(segments) \n");
	bool isLegal = true;

	vector<int> checkRules;
	if (rules.size() == 0)
	{
		vector<DBRule>& dbRules = _dbData->ruleList;
		for (auto& rule : dbRules)
		{
			//segment & duty rules
			//if (rule.classType == "D" || rule.classType == "S")
			{
				if (std::find(checkRules.begin(), checkRules.end(), rule.function) == checkRules.end())
					checkRules.push_back(rule.function);
			}
		}
	}
	else
	{
		for (auto& rule : rules)
		{
			checkRules.push_back(rule);
		}
	}
	//op#1906 检查是否是seg是否属于同个duty
	isLegal = checkSegsInSameDuty(segments);

	if (!isLegal)
		return false;

	if (std::find(checkRules.begin(), checkRules.end(), RULES::LONG_TRANSIT_LIMITATION) != checkRules.end())
		isLegal = checkLongTransit(segments, this->_dbData->getRuleFunctions(RULES::LONG_TRANSIT_LIMITATION), true);


	if (!isLegal)
	{
		recordOptimizerRuleFailureByFunction(RULES::LONG_TRANSIT_LIMITATION);
		return false;
	}

	if (std::find(checkRules.begin(), checkRules.end(), RULES::MIN_CONN_DIP) != checkRules.end())
		isLegal = checkMinConnBetwDIP(segments, this->_dbData->getRuleFunctions(RULES::MIN_CONN_DIP));

	if (!isLegal)
	{
		recordOptimizerRuleFailureByFunction(RULES::MIN_CONN_DIP);
		return false;
	}

	//CHECK_MIN_CONNECT_IN_DUTY（7273）
	if (std::find(checkRules.begin(), checkRules.end(), RULES::CHECK_MIN_CONNECT_IN_DUTY) != checkRules.end()) {
		isLegal = checkMinConnectInDutyRuleForEva(segments);
	}

	if (!isLegal)
	{
		recordOptimizerRuleFailureByFunction(RULES::CHECK_MIN_CONNECT_IN_DUTY);
		return false;
	}

	if (std::find(checkRules.begin(), checkRules.end(), RULES::AIRPORT_RESTRICT) != checkRules.end())
		isLegal = checkAirportRestrict(segments);

	if (!isLegal)
	{
		recordOptimizerRuleFailureByFunction(RULES::AIRPORT_RESTRICT);
		return false;
	}

	if (std::find(checkRules.begin(), checkRules.end(), RULES::DUTY_LIMITATION) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::DUTY_LIMITATION)){
			isLegal = checkDutyLimitation(segments, &singleRule);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureById(singleRule.idRule);
				return false;
			}
		}
	}

	if (std::find(checkRules.begin(), checkRules.end(), RULES::CHECK_LAYOVER_RESTRICTION) != checkRules.end())
	{
		isLegal = checkLayoverRestrictionForDuty(segments);
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
		{
			recordOptimizerRuleFailureByFunction(RULES::CHECK_LAYOVER_RESTRICTION);
			return false;
		}
	}

	if (!isLegal)
	{
		recordOptimizerRuleFailureByFunction(RULES::CHECK_LAYOVER_RESTRICTION);
		return false;
	}
	//BUNK_SETTING (check fleet combination)
	if (std::find(checkRules.begin(), checkRules.end(), RULES::BUNK_SETTING) != checkRules.end())
	{
		const vector<DBRule>& singleRules = this->_dbData->getRuleFunctions(RULES::BUNK_SETTING);

		map<long long, vector<DBRule>> ruleMap;
		for (auto& dbRule : singleRules) {
			ruleMap[dbRule.idRule].emplace_back(dbRule);
		}

		for (auto& pair : ruleMap) {
			auto& tmpDbRules = pair.second;

			isLegal = checkFleetCombination(segments, tmpDbRules);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureById(pair.first);
				return false;
			}
		}
	}

	return isLegal;
}

/*
replaced by bool checkPGRules(vector<Duty *>& duties, vector<int> rules);
bool LegalityChecker::checkPGRules(Duty * duty, int application)
{
bool isLegal = true;
if (!(this->_violations.empty()))
this->_violations.clear();

basicSetting(duty);
vector<Duty *> duties;
duties.push_back(duty);

for (DBRule& singleRule : _ruleFuncMap[RULES::MIN_CONN_DIP]) {
isLegal = checkMinConnBetwDIP(duties, _ruleFuncMap[RULES::MIN_CONN_DIP]);
}
dumpViolations(duties, RULES::MIN_CONN_DIP);

//mantis#2074, 按func分类索引
for (DBRule& singleRule : _ruleFuncMap[RULES::MAX_BLOCK_PERDUTY]) {
isLegal = checkBlockPerDutyByDuty(duty, &singleRule);
}
dumpViolations(duties, RULES::MAX_BLOCK_PERDUTY);

for (DBRule& singleRule : _ruleFuncMap[RULES::MAX_FDP_PERDUTY]) {
isLegal = checkFDPPerDutyByDuty(duty, &singleRule);
}
dumpViolations(duties, RULES::MAX_FDP_PERDUTY);

for (DBRule& singleRule : _ruleFuncMap[RULES::MAX_BLOCK_PERDUTY_R4]) {
isLegal = checkBlockPerDutyByDuty_R4(duty, &singleRule);
}
dumpViolations(duties, RULES::MAX_BLOCK_PERDUTY_R4);

for (DBRule& singleRule : _ruleFuncMap[RULES::MAX_FDP_PERDUTY_R4]) {
isLegal = checkFDPPerDutyByDuty_R4(duty, &singleRule);
}
dumpViolations(duties, RULES::MAX_FDP_PERDUTY_R4);

for (DBRule& singleRule : _ruleFuncMap[RULES::DUTY_LIMITATION]) {
isLegal = checkDutyLimitation(duty, &singleRule);
}
dumpViolations(duties, RULES::DUTY_LIMITATION);

return isLegal;
}
*/

//only for optimizer
bool LegalityChecker::checkPGRules(vector<Duty *>& duties, vector<int> rules)
{
	bool isLegal = true;

	if (!(this->_violations.empty()))
		this->_violations.clear();
	//op#2163 移除duty 五件套初始化
	//for (auto& duty : duties)
	//{
	//	basicSetting(duty);
	//}
	//20190614 ain, mantis#5966, 精简重复计算, 索引 flt_id-> pairing_id, 只在init和add/del/upt pairing时计算
	//1 移除 checkPGRules( dutyVec)中调用, 避免每各 pg都重算一边全部pairingList
	//2 保留初始化 ruleEngine.setDataContext中刷新
	//3 保留 ruleSrv  update_list中 doUpdateActivity后刷新索引 flt_id->pairing_id
	//4 移除 ruleSrv update_list后 calculateCompositionForAddPairing中刷新索引 flt_id->pairing_id
	//2007/2008/3007/3008/2030获取配比初始化
	//makeSegmentToPairingMap();
	vector<DBRule>& dbRules = _dbData->ruleList;
	vector<int> checkRules;
	if (rules.size() == 0)
	{
		for (auto& rule : dbRules)
		{
			//pairing rules
			//if (rule.classType == "P")
			{
				if (std::find(checkRules.begin(), checkRules.end(), rule.function) == checkRules.end())
					checkRules.push_back(rule.function);
			}
		}
	}
	else
	{
		for (auto& rule : rules)
		{
			checkRules.push_back(rule);
		}
	}

	//EXTEND_REST_BY_LENGTH
	if (std::find(checkRules.begin(), checkRules.end(), RULES::EXTEND_REST_BY_LENGTH) != checkRules.end())
	{
		isLegal = checkExtendRestBeforeDuty(duties, NULL);
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
		{
			recordOptimizerRuleFailureByFunction(RULES::EXTEND_REST_BY_LENGTH);
			return false;
		}
		dumpViolations(duties, RULES::EXTEND_REST_BY_LENGTH);
	}

	//PAIRING_LIMITATION
	if (std::find(checkRules.begin(), checkRules.end(), RULES::PAIRING_LIMITATION) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::PAIRING_LIMITATION)){
			isLegal = checkPairingLimitation(duties,&singleRule);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureById(singleRule.idRule);
				return false;
			}
		}
		dumpViolations(duties, RULES::PAIRING_LIMITATION);
		
	}

	//MIN_REST_BEFORE_DUTY
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MIN_REST_BEFORE_DUTY) != checkRules.end())
	{
		isLegal = chekcMinRestBeforeDutyByDP(duties, NULL);
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
		{
			recordOptimizerRuleFailureByFunction(RULES::MIN_REST_BEFORE_DUTY);
			return false;
		}
		dumpViolations(duties, RULES::MIN_REST_BEFORE_DUTY);
	}

	//REST_BY_LENGTH
	if (std::find(checkRules.begin(), checkRules.end(), RULES::REST_BY_LENGTH) != checkRules.end())
	{
		isLegal = checkMinRestBeforeDutyByLength(duties, NULL);
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
		{
			recordOptimizerRuleFailureByFunction(RULES::REST_BY_LENGTH);
			return false;
		}
		dumpViolations(duties, RULES::REST_BY_LENGTH);
	}

	//LONG_TRANSIT_LIMITATION
	if (std::find(checkRules.begin(), checkRules.end(), RULES::LONG_TRANSIT_LIMITATION) != checkRules.end())
	{
		isLegal = checkLongTransit(duties, this->_dbData->getRuleFunctions(RULES::LONG_TRANSIT_LIMITATION));
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
		{
			recordOptimizerRuleFailureByFunction(RULES::LONG_TRANSIT_LIMITATION);
			return false;
		}
		dumpViolations(duties, RULES::LONG_TRANSIT_LIMITATION);
	}

	//MIN_CONN_DIP
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MIN_CONN_DIP) != checkRules.end())
	{
		isLegal = checkMinConnBetwDIP(duties, this->_dbData->getRuleFunctions(RULES::MIN_CONN_DIP));
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
		{
			recordOptimizerRuleFailureByFunction(RULES::MIN_CONN_DIP);
			return false;
		}
		dumpViolations(duties, RULES::MIN_CONN_DIP);
	}

	//LAYOVER_REST
	if (std::find(checkRules.begin(), checkRules.end(), RULES::LAYOVER_REST) != checkRules.end())
	{
		isLegal = checkLayoverRest(duties, this->_dbData->getRuleFunctions(RULES::LAYOVER_REST));
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
		{
			recordOptimizerRuleFailureByFunction(RULES::LAYOVER_REST);
			return false;
		}
		dumpViolations(duties, RULES::LAYOVER_REST);
	}

	//MAX_BLOCK_PERDUTY
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_BLOCK_PERDUTY) != checkRules.end())
	{
		for (auto& duty : duties){
			isLegal = checkBlockPerDutyByDuty(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER)
			{
				recordOptimizerRuleFailureByFunction(RULES::MAX_BLOCK_PERDUTY);
				return false;
			}
		}
		dumpViolations(duties, RULES::MAX_BLOCK_PERDUTY);
	}


	//MAX_FDP_PERDUTY(3007)
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_FDP_PERDUTY) != checkRules.end())
	{
		for (auto& duty : duties){
			isLegal = checkFDPPerDutyByDuty(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER)
			{
				recordOptimizerRuleFailureByFunction(RULES::MAX_FDP_PERDUTY);
				return false;
			}
		}
		dumpViolations(duties, RULES::MAX_FDP_PERDUTY);
	}

	//MAX_FDP_PERDUTY(3007)
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_FDP_PERDUTY_R4) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY_R4)) {
			for (auto& duty : duties) {
				isLegal = checkFDPPerDutyByDuty_R4(duty, nullptr, &singleRule);
				if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
					recordOptimizerRuleFailureById(singleRule.idRule);
					return false;
				}
			}
		}
		dumpViolations(duties, RULES::MAX_FDP_PERDUTY_R4);
	}

	if (std::find(checkRules.begin(), checkRules.end(), RULES::CHECK_COMPOSITION_REQUIREMENT_FOR_HX) != checkRules.end())
	{
		
		for (auto& duty : duties) {
			isLegal = checkCompositionRequirement_HX(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER)
			{
				recordOptimizerRuleFailureByFunction(RULES::CHECK_COMPOSITION_REQUIREMENT_FOR_HX);
				return false;
			}
		}
		
		dumpViolations(duties, RULES::CHECK_COMPOSITION_REQUIREMENT_FOR_HX);
	}

	////MAX_FDP_TIME_QQ(6107) 客舱检查MaxFDP
	//if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_FLIGHT_TIME_QQ_CC) != checkRules.end())
	//{
	//	for (auto& duty : duties) {
	//		isLegal = checkMaxFlightTimeSingleDuty_QQ_CC(duty);
	//		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
	//			return false;
	//	}
	//	dumpViolations(duties, RULES::MAX_FLIGHT_TIME_QQ_CC);
	//}

	//// 6007 QQ检查maxFDP
	//if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_FLIGHT_DUTY_PERIOD_QQ) != checkRules.end())
	//{
	//	for (auto& duty : duties) {
	//		isLegal = checkMaxFlightDutyPeriodSingleDuty_QQ(duty);
	//		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
	//			return false;
	//	}
	//	dumpViolations(duties, RULES::MAX_FLIGHT_DUTY_PERIOD_QQ);
	//}

	//MAX_BLOCK_PERDUTY_R4
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_BLOCK_PERDUTY_R4) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::MAX_BLOCK_PERDUTY_R4)){
			for (auto& duty : duties){
				isLegal = checkBlockPerDutyByDuty_R4(duty, &singleRule);
				if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
					recordOptimizerRuleFailureById(singleRule.idRule);
					return false;
				}
			}
		}
		dumpViolations(duties, RULES::MAX_BLOCK_PERDUTY_R4);
	}

	//MAX_FDP_PERDUTY_R4
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_FDP_PERDUTY_R4) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY_R4)){
			for (auto& duty : duties){
				isLegal = checkFDPPerDutyByDuty_R4(duty, nullptr, &singleRule);
				if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
					recordOptimizerRuleFailureById(singleRule.idRule);
					return false;
				}
			}
		}
		dumpViolations(duties, RULES::MAX_FDP_PERDUTY_R4);
	}


	//DUTY_LIMITATION
	if (std::find(checkRules.begin(), checkRules.end(), RULES::DUTY_LIMITATION) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::DUTY_LIMITATION)){
			isLegal = checkDutyLimitation(duties, &singleRule);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER)
			{
				recordOptimizerRuleFailureById(singleRule.idRule);
				return false;
			}
		}
		dumpViolations(duties, RULES::DUTY_LIMITATION);
	}


	////BUNK_SETTING (check fleet combination)
	//if (std::find(checkRules.begin(), checkRules.end(), RULES::BUNK_SETTING) != checkRules.end())
	//{
	//	for (auto& duty : duties){
	//		isLegal = checkFleetCombination(duty, this->_dbData->getRuleFunctions(RULES::BUNK_SETTING));
	//		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
	//			return false;
	//	}
	//	dumpViolations(duties, RULES::BUNK_SETTING);
	//}

	//MIN_REST_121
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MIN_REST_121) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::MIN_REST_121)){
			for (auto& duty : duties){
				setMinResBy121(duty, &singleRule);
			}
		}
	}

	//GEN_MIN_REST (2124)
	if (std::find(checkRules.begin(), checkRules.end(), RULES::GEN_MIN_REST) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::GEN_MIN_REST)){
			for (auto& duty : duties){
				setMinRest(duty, &singleRule);
			}
		}
	}

	//EASA REST PERIODS (7026)
	if (std::find(checkRules.begin(), checkRules.end(), RULES::EASA_REST_PERIODS) != checkRules.end()) {
		for (auto* duty : duties) {
			setRestPeriods(duty);
		}
	}

	if (std::find(checkRules.begin(), checkRules.end(), RULES::EASA_REST_LNS) != checkRules.end()) {
		setRestByLocalNights(duties);
	}

	//REDUCE_ODP_AT_BASE_QQ (6101)
	if (std::find(checkRules.begin(), checkRules.end(), RULES::REDUCE_ODP_AT_BASE_QQ) != checkRules.end()) {
		for (auto* duty : duties) {
			reduceMinRestAtBase_QQ(duty);
		}
	}

	//REDUCE_ODP_AWAY_FROM_BASE_QQ (6102)
	if (std::find(checkRules.begin(), checkRules.end(), RULES::REDUCE_ODP_AWAY_FROM_BASE_QQ) != checkRules.end()) {
		for (auto* duty : duties) {
			reduceMinRestAwayFromBase_QQ(duty);
		}
	}

	//0000 最后计算
	calculateGeneralRule(duties);

	//AIRPORT_RESTRICT
	if (std::find(checkRules.begin(), checkRules.end(), RULES::AIRPORT_RESTRICT) != checkRules.end())
	{
		isLegal = checkAirportRestrict(duties);
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
			return false;
		dumpViolations(duties, RULES::AIRPORT_RESTRICT);
	}


	//PAIRING_MIN_REST_IN_XHOURS
	if (std::find(checkRules.begin(), checkRules.end(), RULES::PAIRING_MIN_REST_IN_XHOURS) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::PAIRING_MIN_REST_IN_XHOURS)){
			isLegal = checkPairingMinRest(duties, &singleRule);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureById(singleRule.idRule);
				return false;
			}
		}
		dumpViolations(duties, RULES::PAIRING_MIN_REST_IN_XHOURS);
	}


	//2027
	//MIN_REST_POST_DUTY_FOR_CABIN
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MIN_REST_POST_DUTY_FOR_CABIN) != checkRules.end())
	{
		for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::MIN_REST_POST_DUTY_FOR_CABIN)){
			for (std::size_t i = 0; i < duties.size(); i++) {
				Duty* duty = duties[i];
				Duty* nextDuty = (i+1)>= duties.size() ? nullptr : duties[i+1];
				isLegal = checkMinPostDutyForCabin(duty, nextDuty, &singleRule);
				if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
					recordOptimizerRuleFailureById(singleRule.idRule);
					return false;
				}
			}
		}
		dumpViolations(duties, RULES::MIN_REST_POST_DUTY_FOR_CABIN);
	}

	//2030
	//MAX_FLIGHT_DUTY_PERIOD_CABIN
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_FLIGHT_DUTY_PERIOD_CABIN) != checkRules.end())
	{
		const vector<DBRule>& singleRules = this->_dbData->getRuleFunctions(RULES::MAX_FLIGHT_DUTY_PERIOD_CABIN);
		for (auto& duty : duties){
			isLegal = checkMaxFlightDutyPeriodCabin(duty, singleRules);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER)
				return false;
		}
		dumpViolations(duties, RULES::MAX_FLIGHT_DUTY_PERIOD_CABIN);

	}

	//2130
	//NEW_MAX_FLIGHT_DUTY_PERIOD_CABIN
	if (std::find(checkRules.begin(), checkRules.end(), RULES::NEW_MAX_FLIGHT_DUTY_PERIOD_CABIN) != checkRules.end())
	{
		const vector<DBRule>& singleRules = this->_dbData->getRuleFunctions(RULES::NEW_MAX_FLIGHT_DUTY_PERIOD_CABIN);
		for (auto duty : duties) {
			isLegal = checkMaxFlightDutyPeriodCabinNew(duty, singleRules);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER)
				return false;
		}
		dumpViolations(duties, RULES::NEW_MAX_FLIGHT_DUTY_PERIOD_CABIN);

	}

	//7434
	if (std::find(checkRules.begin(), checkRules.end(), RULES::SQ_CA_MAX_DUTY_PERIOD_WITH_TRAILING_DEADHEAD) != checkRules.end())
	{
		for (auto* duty : duties) {
			isLegal = checkMaxDutyPeriod_SQ(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureByFunction(RULES::SQ_CA_MAX_DUTY_PERIOD_WITH_TRAILING_DEADHEAD);
				return false;
			}
			// 7434 already records structured violations directly.
			// Clear legacy duty messages so the final dump does not emit a duplicate rule 0 violation.
			duty->clearViolations();
		}
	}

	// 检查duty间的2112 20200915
	if (std::find(checkRules.begin(), checkRules.end(), RULES::BUNK_SETTING) != checkRules.end()) {
		const vector<DBRule>& singleRules = this->_dbData->getRuleFunctions(RULES::BUNK_SETTING);

		map<long long, vector<DBRule>> ruleMap;
		for (auto& dbRule : singleRules) {
			ruleMap[dbRule.idRule].emplace_back(dbRule);
		}

		for (auto& pair : ruleMap) {
			auto& tmpDbRules = pair.second;

			isLegal = checkFleetCombination(duties, tmpDbRules);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureById(pair.first);
				return false;
			}
			dumpViolations(duties, RULES::BUNK_SETTING);
		}

	}

	//8115
	if (std::find(checkRules.begin(), checkRules.end(), RULES::MAX_CONSECUTIVE_DUTY_DAYS_R6) != checkRules.end())
	{
		isLegal = this->checkMaxConsecutiveDuty_R6(duties);
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
		{
			return false;
		}
		dumpViolations(duties, RULES::MAX_CONSECUTIVE_DUTY_DAYS_R6);
	}

	//CHECK_SEG_RESTRICT_WOCL_FOR_EVA_FD（7204）
	if (std::find(checkRules.begin(), checkRules.end(), RULES::CHECK_SEG_RESTRICT_WOCL_FOR_EVA_FD) != checkRules.end()) {
		for (auto* duty : duties) {
			isLegal = checkSegmentRestrictionWOCLForEvaFd(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER)
				return false;
			dumpViolations(duty, RULES::CHECK_SEG_RESTRICT_WOCL_FOR_EVA_FD);
		}
	}


	//CHECK_FLIGHT_DHD_LIMIT（6037）
	if (std::find(checkRules.begin(), checkRules.end(), RULES::CHECK_FLIGHT_DHD_LIMIT) != checkRules.end()) {
		for (auto* duty : duties) {
			isLegal = checkFlightDHD_QQ(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER)
				return false;
			dumpViolations(duty, RULES::CHECK_FLIGHT_DHD_LIMIT);
		}
	}

	//CHECK_MIN_CONNECT_IN_DUTY（7273）
	if (std::find(checkRules.begin(), checkRules.end(), RULES::CHECK_MIN_CONNECT_IN_DUTY) != checkRules.end()) {
		isLegal = checkMinConnectInDutyRuleForEva(duties);
		if (!isLegal && this->_application == PAIRING_OPTIMIZER)
			return false;
		dumpViolations(duties, RULES::CHECK_MIN_CONNECT_IN_DUTY);
	}

	//7460
	if (std::find(checkRules.begin(), checkRules.end(), RULES::RESTRICT_MID_DUTY_BASE_TURN) != checkRules.end()) {
		for (auto* duty : duties) {
			isLegal = checkRestrictMidDutyBaseTurn_SQ(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureByFunction(RULES::RESTRICT_MID_DUTY_BASE_TURN);
				return false;
			}
			// 7460 already records structured violations directly.
			// Clear legacy duty messages so the final dump does not emit a duplicate rule 0 violation.
			duty->clearViolations();
		}
	}

	//7461
	if (std::find(checkRules.begin(), checkRules.end(), RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ) != checkRules.end()) {
		for (auto* duty : duties) {
			isLegal = checkDhdAndPositionOnFreightForSQ(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureByFunction(RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ);
				return false;
			}
			// 7461 already records structured violations directly.
			// Clear legacy duty messages so the final dump does not emit a duplicate rule 0 violation.
			duty->clearViolations();
		}
	}

	//7462
	if (std::find(checkRules.begin(), checkRules.end(), RULES::CHECK_ALLOWED_MULTI_SECTOR_DUTY_FOR_FREIGHTER_FOR_SQ) != checkRules.end()) {
		for (auto* duty : duties) {
			isLegal = checkAllowedMultiSectorDutyForFreighterForSQ(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureByFunction(RULES::CHECK_ALLOWED_MULTI_SECTOR_DUTY_FOR_FREIGHTER_FOR_SQ);
				return false;
			}
			// 7462 already records structured violations directly.
			// Clear legacy duty messages so the final dump does not emit a duplicate rule 0 violation.
			duty->clearViolations();
		}
	}

	//7450
	if (std::find(checkRules.begin(), checkRules.end(), RULES::SQ_CA_FDP_SECTOR_LIMIT) != checkRules.end()) {
		for (auto* duty : duties) {
			isLegal = checkFdpSectorLimit_SQ(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureByFunction(RULES::SQ_CA_FDP_SECTOR_LIMIT);
				return false;
			}
			// 7450 already records structured violations directly.
			// Clear legacy duty messages so the final dump does not emit a duplicate rule 0 violation.
			duty->clearViolations();
		}
	}

	//7469
	if (std::find(checkRules.begin(), checkRules.end(), RULES::FORCED_COMPLEMENT_BY_DUTY_ROUTE_FOR_SQ) != checkRules.end()) {
		for (auto* duty : duties) {
			isLegal = checkForcedComplementByDutyRouteForSQ(duty);
			if (!isLegal && this->_application == PAIRING_OPTIMIZER) {
				recordOptimizerRuleFailureByFunction(RULES::FORCED_COMPLEMENT_BY_DUTY_ROUTE_FOR_SQ);
				return false;
			}
			// 7469 already records structured violations directly.
			// Clear legacy duty messages so the final dump does not emit a duplicate rule 0 violation.
			duty->clearViolations();
		}
	}


	//CHECK_MINIMUM_REST_PERIOD_FOR_SQ (7412), PO fast path
	if (std::find(checkRules.begin(), checkRules.end(), RULES::CHECK_MINIMUM_REST_PERIOD_FOR_SQ) != checkRules.end())
	{
		if (this->_application == PAIRING_OPTIMIZER) {
			isLegal = checkMinimumRestPeriodForSQRule(duties);
			if (!isLegal) {
				recordOptimizerRuleFailureByFunction(RULES::CHECK_MINIMUM_REST_PERIOD_FOR_SQ);
				return false;
			}
		}
	}

	if (this->_application != PAIRING_OPTIMIZER)
		isLegal = checkMinRest(duties);

	dumpViolations(duties, 0);

	return isLegal;
}

void LegalityChecker::dumpViolations(vector<Duty *> duties, long long ruleId)
{
	if (this->_application == PAIRING_OPTIMIZER)
		return;
	for (auto& duty : duties)
	{
		dumpViolations(duty, ruleId);
	}
}

void LegalityChecker::dumpViolations(Duty* duty, long long ruleId)
{
	if (this->_application == PAIRING_OPTIMIZER)
		return;

	vector<string> messages = duty->getViolationMessage();
	for (auto& message : messages)
	{
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->pairingId = duty->getPairingId();
		rv->dutySequenceNumber = duty->getDutySegNum();
		rv->startDTUtc = duty->getStartTimeUtcAct();
		rv->endDTUtc = duty->getEndTimeUtcAct();
		rv->violation_msg = message;
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
		rv->idRule = ruleId;
		this->addRuleViolations(rv, NULL);
	}
	duty->clearViolations();
	for (auto& segment : duty->getSegments())
	{
		vector<string> messages = segment->getViolationMessage();
		for (auto& message : messages)
		{
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySegNum();
			rv->startDTUtc = segment->getStartTimeUtcAct();
			rv->endDTUtc = segment->getEndTimeUtcAct();
			rv->violation_msg = message;
			rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
			rv->idRule = ruleId;
			this->addRuleViolations(rv, NULL);
		}
		segment->clearViolations();
	}
}

void LegalityChecker::dumpViolations(Pairing * pairing, long long ruleId)
{
	if (this->_application == PAIRING_OPTIMIZER)
		return;
	vector<string> messages = pairing->getViolationMessage();
	for (auto& message : messages)
	{
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->pairingId = pairing->getDbId();
		//rv->dutySequenceNumber = duty->getDutySegNum();
		rv->startDTUtc = pairing->getStartTimeUtcAct();
		rv->endDTUtc = pairing->getEndTimeUtcAct();
		rv->violation_msg = message;
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
		rv->idRule = ruleId;
		this->addRuleViolations(rv, NULL);
	}
	pairing->clearViolations();
	dumpViolations(pairing->getDutyVec(), ruleId);
}

bool LegalityChecker::checkMinPostDutyForCabin(Duty* duty, Duty* nextDuty, const DBRule* singleRule){
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	int minRestMun = 0;//20200328 ain, init var
	string minFdp, maxFdp, minRest;
	for (iter = parameter.begin(); iter != parameter.end(); iter++){
		header = iter->first;
		headeValue = iter->second;

		if (header == "MIN FDP") {
			minFdp = headeValue;
		}
		if (header == "MAX FDP") {
			maxFdp = headeValue;
		}
		if (header == "MIN REST") {
			minRest = headeValue;
			minRestMun = hhmmToMinutes(headeValue.c_str());
		}
	}
	int checkMaxFdp = 0, checkMinFdp = 0, checkMinRest = 0;//20200328 ain, init var
	std::size_t iPos = maxFdp.find(":");
	if (iPos != string::npos)
		checkMaxFdp = stoi(maxFdp.substr(0, iPos)) * 3600 + stoi(maxFdp.substr(iPos + 1)) * 60;
	else
		return true;
	iPos = minFdp.find(":");
	if (iPos != string::npos)
		checkMinFdp = stoi(minFdp.substr(0, iPos)) * 3600 + stoi(minFdp.substr(iPos + 1)) * 60;
	else
		return true;
	iPos = minRest.find(":");
	if (iPos != string::npos)
		checkMinRest = stoi(minRest.substr(0, iPos)) * 3600 + stoi(minRest.substr(iPos + 1)) * 60;
	else
		return true;
	if (duty->getActualFDP() * 60 < checkMinFdp || duty->getActualFDP() * 60 > checkMaxFdp){
		return true;
	}
	int actualRest = duty->getActualRest();
	int checkTime = actualRest * 60;
	duty->setMinRest(minRestMun);
	if (checkTime < checkMinRest){
		bReturn = false;
	}
	else{
		return true;
	}

	bool isPo = this->GetApplication() == PAIRING_OPTIMIZER;
	if (!isPo)
	{
		vector<Duty*> dutys = this->_dbData->pairingIdMap[duty->getPairingId()]->getDutyVec();
		if (dutys[dutys.size() - 1]->getSegCoverValue() == duty->getSegCoverValue()){
			return true;
		}
	}

	if (!bReturn){
		//20190418 ain, mantis#5183, 注释掉未使用 rule_violation 避免leak
		//string errorMsg = "actural rest(" + Utility::GetInstancePtr()->iToa(duty->getActualRest() / 60) + ":" + Utility::GetInstancePtr()->iToa(duty->getActualRest() % 60) + ")is less than min rest(" + Utility::GetInstancePtr()->iToa(checkMinRest/3600) + ":" + Utility::GetInstancePtr()->iToa((checkMinRest/60) % 60) + ")";
		//setLegalityMessage(duty, NULL, NULL, errorMsg);
		//RULE_VIOLATION* rv = new RULE_VIOLATION();
		//rv->pairingId = duty->getPairingId();
		//rv->dutySequenceNumber = duty->getDutySegNum();
		//rv->startDTUtc = duty->getStartTimeUtcAct();
		//rv->endDTUtc = duty->getEndTimeUtcAct();
		//rv->violation_msg = errorMsg;
		//rv->type = VIOLATION_TYPE::DUTY_VIOLATION;

	}
	return bReturn;
}


bool LegalityChecker::checkRosterSpaceByWP(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strDefinition, strValue;
	string pStart, pEnd, pGap, sUnit, pBases = "*", pRanks = "*", pFleets = "*", pDuties = "*";
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "BASES") {
			pBases = headeValue;
		}
		if (header == "RANKS") {
			pRanks = headeValue;
		}
		if (header == "FLEETS") {
			pFleets = headeValue;
		}
		if (header == "WP RANGE START") {
			pStart = headeValue;
		}
		if (header == "WP RANGE END") {
			pEnd = headeValue;
		}
		if (header == "MIN GAP") {
			pGap = headeValue;
		}
		if (header == "ROSTER DUTIES") {
			pDuties = headeValue;
		}
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;
	int iGap = hhmmToMinutes(pGap.c_str());
	int iWPStart = hhmmToMinutes(pStart.c_str());
	int iWPEnd = hhmmToMinutes(pEnd.c_str());

	time_t lCheckedStart = rosters[0]->actStrUtc;
	time_t lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;

	//base/rank/fleet/team
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBases, pRanks, pFleets, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<string> vDuties;
	split(pDuties, '|', vDuties);
//	boost::split(vDuties, pDuties, boost::is_any_of("|"), boost::token_compress_on);

	for (int i = 0; i < (int)rosters.size(); ++i)
	{
		if (!(rosters[i]->pairing))
			continue;
		if (pDuties != "*")
		{
			if (std::find(vDuties.begin(), vDuties.end(), rosters[i]->duty) == vDuties.end())
				continue;
		}
		vector<Duty *> duties = rosters[i]->pairing->getDutyVec();

		for (int j = 0; j < (int)duties.size(); ++j)
		{
			//int iWP = duties[j]->getActWpMin() + duties[j]->getActExtendWpMin();
			// mantis#6280, 直接取得正確的WP
			int iWP = rosters[i]->dutyValues.getActWp(j);

			if (!(iWP >= iWPStart && iWP <= iWPEnd))
				continue;
			time_t restStart, restEnd;
			int iRest = 999999;
			if (j == duties.size() - 1)
			{
				if (i != rosters.size() - 1)
				{
					int iIndex = Utility::GetInstancePtr()->getNextWorkingRosterIndex(rosters, this->_restAssignments, i);
					if (iIndex > i)
					{
						restStart = rosters[i]->actRestStrUtc;
						restEnd = rosters[iIndex]->actStrUtc;
						iRest = static_cast<int>(restEnd - restStart) / 60;
					}
				}
				else
					continue;
			}
			else
			{
				restStart = duties[j]->getEndTimeUtcAct();
				restEnd = duties[j + 1]->getStartTimeUtcAct();
				iRest = static_cast<int>(restEnd - restStart) / 60;
			}

			if (iRest < iGap)
			{
				if (!(rosters[i]->needRuleCheck) && !(i < (int)rosters.size() - 1 && rosters[i + 1]->needRuleCheck) && (this->_application == ROSTER_OPTIMIZER))
					continue;
				bReturn = false;

				string msg = "The spacing between two duties in the work package range ({0:pStart}-{1:pEnd}) is less than the minimum required gap ({2:pGap}).";
				msg = StringUtils::Format(msg, pStart, pEnd, pGap);
				setLegalityMessage(rosters[i], pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->rosterId = rosters[i]->rosterId;
				rv->pairingId = rosters[i]->pairId;
				rv->dutySequenceNumber = duties[j]->getDutySegNum();
				rv->startDTUtc = restStart;
				rv->endDTUtc = restEnd;
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("pStart", pStart));
				rv->operation_result.insert(pair<string, string>("pEnd", pEnd));
				rv->operation_result.insert(pair<string, string>("pGap", pGap));
				rv->violation_msg = msg;
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}
		}
	}

	return bReturn;
}


/*
8014
根据DUTY GROUP和RANK,FLEET检查ROSTER需要的资质
RANK,FLEET,QUAL,ASSIGNMENT GROUP,ALERT BUFFER,ALERT UNIT
*,	*,		SEP,FLY,			30,				D
*/
bool LegalityChecker::checkDutyGroupReqQual(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	string strDefinition, strValue;

	rule8014* ruleParam = (rule8014*)singleRule->parsedParam.get();
	int iBuffer = ruleParam->iBuffer;
	string rActiveRanks = ruleParam->rActiveRanks;
	string rQual = ruleParam->rQual;
	string rDutyGroup = ruleParam->rDutyGroup;
	string rAlertUnit = ruleParam->rAlertUnit;
	string rRank = ruleParam->rRank;
	string rFleet = ruleParam->rFleet;
	string rQualFleets = ruleParam->rQualFleets;
	string rQualFleetsGroup = ruleParam->rQualFleetsGroup;
	string rCrewFleets = ruleParam->rCrewFleets;
	string rServiceType = ruleParam->rServiceType;
	string rExcludeRoles = ruleParam->rExcludeRoles;
	string rExcludeSubRoles = ruleParam->rExcludeSubRoles;
	vector<string>& qualifications = ruleParam->qualifications;
	vector<string>& fleets = ruleParam->fleets;
	vector<string>& assignmentGroups = ruleParam->assignmentGroups;
	vector<string>& actingRanks = ruleParam->actingRanks;
	vector<string>& qualFleets = ruleParam->qualFleets;
	vector<string>& qualFleetsGroups = ruleParam->qualFleetsGroups;
	vector<string>& crewFleets = ruleParam->crewFleets;
	vector<string>& segTypes = ruleParam->segTypes;
	vector<string>& excludeRoles = ruleParam->excludeRoles;
	vector<string>& excludeSubRoles = ruleParam->excludeSubRoles;
	SharedPtr<CREW>& crew = this->_dbData->crewList[pCrew->crewIndex];
	string crewid = crew->idCrew;
	
	vector<SharedPtr<ROSTER>> rosters;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
		if (pCrew->RosterIndex >= 0) {
			
			if (_dbData->qualExtensionConfigMap.empty()) {
				rosters.push_back(crew->rosterList[pCrew->RosterIndex]);
			}
			else {
				rosters = RosterUtils::FilterRostersByQualExtension(pCrew->RosterIndex, crew, this->_dbData);
			}
		}
		else
			rosters = crew->rosterList;
	}
	else
	{
		rosters = crew->rosterList;
		if (rosters.size() >= 1)
		{
			lCheckedStart = rosters[0]->actStrUtc;
			lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
		}
	}
	//mantis#1847, crew.rosterList为空判断
	if (rosters.empty()) {
		return true;
	}

	vector<SharedPtr<CREW_QUALIFICATION>>&  quals = this->_dbData->crewIdMap[crewid]->qualificationList;
	
	vector<SharedPtr<CREW_RANK>>& ranks = this->_dbData->crewList[pCrew->crewIndex]->rankList;
	string sDutyGroup;
	vector<SharedPtr<DBRule_8014>>& asnGroup = this->_dbData->rule_8014;

	

	vector<string> vDutyGroup;
	//rDutyGroup
	if (rDutyGroup != "*")
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = asnGroup.begin(); assignment != asnGroup.end(); ++assignment)
		{
			//if ((*assignment)->assignmentGroup == rDutyGroup)
			if (std::find(assignmentGroups.begin(), assignmentGroups.end(), (*assignment)->assignmentGroup) != assignmentGroups.end())
			{
				vDutyGroup.push_back((*assignment)->assignemnt);
			}
		}
	}
	vector<string>::iterator isDutyGroupMatched;

	time_t lBuffer;
	if (rAlertUnit == "D")
		lBuffer = iBuffer * 24 * 60 * 60;
	else
		lBuffer = iBuffer * 24 * 60 * 60;

	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (vector<SharedPtr<ROSTER>>::iterator it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
	{
		auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs((*it_roster).get(), this->_dbData->qualExtensionConfigMap);
		qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());

		//if (this->_application == ROSTER_OPTIMIZER && (!((*it_roster)->needRuleCheck) && ((*it_roster)->source=="PA")))
		if (this->_application == ROSTER_OPTIMIZER && (*it_roster)->source == "PA")
			continue;

		if (!Utility::GetInstancePtr()->isCrewQualified(crew, "*", rActiveRanks, "*", "*", "*", (*it_roster)->actStrUtc, (*it_roster)->actRestStrUtc))
			continue;

		//if (rRank != "*" && rRank != (*it_roster)->actingRank)
		if (rRank != "*" && std::find(actingRanks.begin(), actingRanks.end(), (*it_roster)->actingRank) == actingRanks.end())
			continue;

		if ((*it_roster)->pairing)
		{
			for (std::size_t di = 0; di < (*it_roster)->pairing->getNumDuties(); ++di)
			{
				Duty * duty = (*it_roster)->pairing->getDuty(di);
				for (std::size_t si = 0; si < duty->getNumSegments(); si++)
				{
					Segment * segment = duty->getSegment(si);
					if (segTypes[0] != "*" && find(segTypes.begin(), segTypes.end(), segment->getDomIntType()) == segTypes.end()){
						continue;
					}
					if (ruleParam->rTailNums != "*")
					{
						if (!(segment->getTailNum().empty()))
						{
							if (std::find(ruleParam->tailNumbers.begin(), ruleParam->tailNumbers.end(), segment->getTailNum()) == ruleParam->tailNumbers.end())
								continue;
						}
					}
					if (!rServiceType.empty() && rServiceType != "*") {
						if (rServiceType != segment->getServiceType())
							continue;
					}

					const auto& rosterFlight = this->_dbData->rosterFlightMgr.get(segment->getDBId(), crew->idCrew);
					if (rosterFlight) {
						if (rExcludeRoles != "*" && !rExcludeRoles.empty()) {
							if (find(excludeRoles.begin(), excludeRoles.end(), rosterFlight->tmRole) != excludeRoles.end())
								continue;
						}

						if (rExcludeSubRoles != "*" && !rExcludeSubRoles.empty()) {
							if (find(excludeSubRoles.begin(), excludeSubRoles.end(), rosterFlight->tmSubRole) != excludeSubRoles.end())
								continue;
						}
					}
					if (rCrewFleets != "*" && !Utility::GetInstancePtr()->isCrewFleetQualified(crew, crewFleets, segment->getStartTimeUtcAct(), segment->getEndTimeUtcAct())) {
						continue;
					}

					if (rDutyGroup == "*")
						isDutyGroupMatched = std::find(vDutyGroup.begin(), vDutyGroup.end(), (*it_roster)->duty);
					else
						isDutyGroupMatched = std::find(vDutyGroup.begin(), vDutyGroup.end(), segment->getAssignment());

					//if (rFleet == "*" || rFleet == (*it_seg)->getFleetCD())
					if ((rFleet == "*") || (std::find(fleets.begin(), fleets.end(), segment->getFleetCD()) != fleets.end()))
					{
						if (rDutyGroup == "*" || isDutyGroupMatched != vDutyGroup.end())
						{
							bool bHasQual = false;
							//check qual from here
							bool hasQualFleetFilter = (rQualFleets != "*" || rQualFleetsGroup != "*");
							if (rQual == "*" && !hasQualFleetFilter)
							{
								bHasQual = true;
							}
							else
							{
								for (vector<SharedPtr<CREW_QUALIFICATION>>::iterator it_qual = quals.begin(); it_qual != quals.end(); ++it_qual)
								{
									if (rQual != "*" && std::find(qualifications.begin(), qualifications.end(), (*it_qual)->qual) == qualifications.end())
									{
										continue;
									}
									time_t issuedUtc = (*it_qual)->issuedUtc;
									time_t expiredUtc = (*it_qual)->expiryUtc;
									if (expiredUtc <= 0)
									{
										expiredUtc = time(NULL) + 365 * 24 * 60 * 60;
									}
									if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0 )) {
										auto qualPeriod = RosterUtils::GetQualExtension((*it_qual), qualExtensionConfigsForQualMap);
										issuedUtc = std::get<0>(qualPeriod);
										expiredUtc = std::get<1>(qualPeriod);
									}
									if (issuedUtc < segment->getStartTimeUtcAct() && expiredUtc - lBuffer > segment->getEndTimeUtcAct())
									{
										if (rQualFleets != "*" && std::find(qualFleets.begin(), qualFleets.end(), (*it_qual)->fleetGrp) == qualFleets.end())
										{
											continue;
										}
										if (rQualFleetsGroup != "*"
											&& std::find(qualFleetsGroups.begin(), qualFleetsGroups.end(), (*it_qual)->fleetGrp) == qualFleetsGroups.end()
											&& std::find(qualFleetsGroups.begin(), qualFleetsGroups.end(), (*it_qual)->acType) == qualFleetsGroups.end())
										{
											continue;
										}
										bHasQual = true;
										break;
									}
								}
							}
							if (!bHasQual)
							{
								//print and set violations here
								//string msg = "[Duty group rule]Crew(" + crewid + ") don't has qual(" + rQual + ") or it will be expired in " + rAlertBuffer + rAlertUnit + " with assignment group(" + rDutyGroup+") and fleets("+rFleet+").";
								stringstream ss;
								//ss << "[Duty group rule]Crew(" << crewid << ") don't has qual(" << rQual << ") or it will be expired in " << iBuffer << rAlertUnit << " with assignment group(" << rDutyGroup << ") and fleets(" << rFleet << ").";
								ss << (*it_roster)->label << " Crew does not have qual(" << rQual << ") or it will be expired in " << iBuffer << rAlertUnit << " with assignment group(" << rDutyGroup << ") and fleets(" << rFleet << ").";
								string msg = ss.str();
								//setLegalityMessage(segment, singleRule, msg);
								pCrew->isLegal = false;
								bReturn = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = crewid;
								rv->rosterId = (*it_roster)->rosterId;
								rv->pairingId = (*it_roster)->pairId;
								//rv->dutySequenceNumber = (*it_duty)->getDutySegNum();
								rv->segmentId = segment->getDBId();
								rv->startDTUtc = segment->getStartTimeUtcAct();
								rv->endDTUtc = segment->getEndTimeUtcAct();
								rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("label", (*it_roster)->label));
								rv->operation_result.insert(pair<string, string>("rQual", rQual));
								rv->operation_result.insert(pair<string, string>("iBuffer", Utility::GetInstancePtr()->iToa(iBuffer)));
								rv->operation_result.insert(pair<string, string>("rAlertUnit", rAlertUnit));
								rv->operation_result.insert(pair<string, string>("rDutyGroup", rDutyGroup));
								rv->operation_result.insert(pair<string, string>("rFleet", rFleet));
								rv->violation_msg = msg;
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER){
									return false;
								}
							}
						}
					}
				}
			}
		}
	}

	return bReturn;
}

/*
8003 Acting Rank Rule
Table:RANK_ACTING
Logic:
1. Acting Rank和Active Rank不一致时，仅仅在表中出现的情形才被允许
2. 如果QUAL有设置，额外检查该Crew是否有该资质；空代表，不需要检查资质
*/
bool LegalityChecker::checkActingRank(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	//mantis#2219, 8003需要一次处理全部列表，因此只在第一个rule param对象保存完整parseRuleParam，后续rule param留空避免重复计算
	rule8003 * cache = (rule8003 *)singleRule->parsedParam.get();
	if (cache == NULL) {
		return true;
	}
	vector<rule8003item>& ruleParamRankActingList = cache->list;

	//exception
	if (pCrew->crewIndex < 0)
	{
		printf("ERROR: rule 8003 fail, invalid param crew index=%d.\n", pCrew->crewIndex);
		return true;
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	string crewid = crew->idCrew;

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_QUALIFICATION>>&  quals = crew->qualificationList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	//vector<DBRankActing>& actingRanks = this->_dbData->rankActingList;
	time_t rank_eff = 0, rank_exp = 0;
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (auto& roster : rosters)
	{
		if (this->GetApplication() == ROSTER_OPTIMIZER && roster->source != "CR")
		{
			continue;
		}

		// 地面任务没有actingRank，跳过检查
		if (!roster->pairing)
			continue;

		auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(roster.get(), this->_dbData->qualExtensionConfigMap);
		qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());

		string actingRank = roster->actingRank;
		time_t startDate = roster->actStrUtc;
		time_t endDate = roster->actRestStrUtc;

		bool bFound = false;
		for (auto& rank : ranks)
		{
			string crew_rank = rank->rank;
			rank_eff = rank->effUtc;
			rank_exp = rank->expUtc;
			if (rank_exp < rank_eff || -1 == rank_exp)
				rank_exp = rank_eff + 60 * 60 * 24 * 365 * 10;

			//申请SDO任务告警，request的actingrank是空
			if ((actingRank != "" && actingRank != crew_rank) && (rank_eff <= startDate) && (rank_exp >= endDate))
			{
				//mantis#2255, 8003按 rule param检查，不再判断 down grade
				//bool isDown = Utility::GetInstancePtr()->isDownGrade(this->_dbData->rankList, this->_dbData->scenario.airline, crew_rank, actingRank);
				bool isWithinScenario = Utility::GetInstancePtr()->isDownRankInScenario(crew_rank, actingRank, this->_dbData->scenario.ranks, this->_dbData->scenario.actingRanks);
				
				//if (!isDown)
				//mantis#2219, 8003, ruleParam代替 rank_acting表
				for (rule8003item& rRankActing : ruleParamRankActingList)
				{
					//if (crew->idCrew == "217621" && rRankActing.activeRank == "CP" && roster->rosterId == 27528421)
					//	printf("");
					//mantis#2279, 允许通配符‘*’
					//0004565: 8003法規Upgrade設置CP可服勤DP|AP|CA，但editor上CP服勤DP時有報錯
					if (rRankActing.actingRank != "*" && !isContains(rRankActing.actingRanks, actingRank))  //rRankActing.actingRank != actingRank)
						//if (rRankActing.actingRank != "*" && rRankActing.actingRank != actingRank)
						continue;
					if (rRankActing.activeRank != "*" && !isContains(rRankActing.activeRanks, crew_rank)) //rRankActing.activeRank != crew_rank)
						//if (rRankActing.activeRank != "*" && rRankActing.activeRank != crew_rank)
						continue;
					if (rRankActing.assignmentGroupStr != "*" && !isContains(rRankActing.assignmentGroups, roster->duty))
						continue;
					if (rRankActing.crewFleetsStr != "*" && !Utility::GetInstancePtr()->isCrewFleetQualified(crew, rRankActing.crewFleets, startDate, endDate))
						continue;
					//bFound = false;
					string requiredQul = rRankActing.qual;
					bool hasQualFleetFilter = (rRankActing.qualFleetsStr != "*" || rRankActing.qualFleetsGroupStr != "*");
					if (requiredQul != "*" || hasQualFleetFilter) {
						for (const auto& crewQual : quals) {
							if (requiredQul != "*" && !isContains(rRankActing.quals, crewQual->qual)) {
								continue;
							}

							time_t eff = crewQual->issuedUtc;
							time_t exp = crewQual->expiryUtc;
							int extensionTime = 0;
							string extensionUnit;
							auto posQual = qualExtensionConfigsForQualMap.equal_range(crewQual->qual);
							if (posQual.first != posQual.second) {
								auto& activityConfig = posQual.first->second;
								auto& config = std::get<1>(activityConfig);
								extensionTime = config->extensionTime;
								extensionUnit = config->extensionUnit;
							}

							if (extensionTime != 0) {
								if (extensionUnit == "CD")
									exp += extensionTime * (3600 * 24);
								else if (extensionUnit == "CW")
									exp += extensionTime * 7 * (3600 * 24);
								else if (extensionUnit == "CM")
									exp = Utility::GetInstancePtr()->addMonths(exp, extensionTime);
							}

							if ((crewQual->status != "V" && crewQual->status != "F" && crewQual->status != "T" && crewQual->status != "A")
								|| eff > startDate || (exp != -1 && exp < endDate)) {
								continue;
							}

							if (rRankActing.qualFleetsStr != "*" && !isContains(rRankActing.qualFleets, crewQual->fleetGrp)) {
								continue;
							}
							if (rRankActing.qualFleetsGroupStr != "*"
								&& !isContains(rRankActing.qualFleetsGroups, crewQual->fleetGrp)
								&& !isContains(rRankActing.qualFleetsGroups, crewQual->acType)) {
								continue;
							}

							bFound = true;
							break;
						}
					}
					else {
						bFound = true;
					}
				}

			}
			else if (actingRank != "" && actingRank == crew_rank && rank_eff <= startDate && rank_exp >= endDate) {
				bFound = true;
			}
		}
		if (!bFound)
		{
			//if (crew->idCrew == "217621" && roster->rosterId == 27528421)
			//	printf("");
			stringstream ss;
			ss << "This crew cannot act as acting rank(" << actingRank << ") on pairing(" << roster->pairId << ").";
			string msg = ss.str();
			setLegalityMessage(roster, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crewid;
			rv->rosterId = roster->rosterId;
			//rv->pairingId = (*it_roster)->pairId;
			//rv->dutySequenceNumber = (*it_duty)->getDutySegNum();
			//rv->segmentId = (*it_seg)->getDBId();
			rv->startDTUtc = roster->actStrUtc;
			rv->endDTUtc = roster->actRestStrUtc;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("actingRank", actingRank));
			rv->operation_result.insert(pair<string, string>("pairId", Utility::GetInstancePtr()->llToa(roster->pairId)));
			rv->operation_result.insert(pair<string, string>("label", roster->label));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
	}

	return bReturn;
}


int LegalityChecker::getNumberOfProbationers(vector<SharedPtr<CrewOnFlight>>& crews, vector<string>& vActiveRanks, vector<string>& vActingRanks, vector<string>& probSettings, time_t nowDay, vector<string>& vAssignmentGroups, string rDateOfJoinRange, bool bUtilizePrev)
{

	int dateOfJoinLowwer = 0, dateOfJoinUpper = 0;
	if (!rDateOfJoinRange.empty() && rDateOfJoinRange != "*" && rDateOfJoinRange.find('-') != string::npos)
	{
		size_t pos = rDateOfJoinRange.find('-');
		try
		{
			dateOfJoinLowwer = stoi(rDateOfJoinRange.substr(0, pos));
			dateOfJoinUpper = stoi(rDateOfJoinRange.substr(pos + 1));
		}
		catch (string e)
		{
			Logger::getRuleLogger()->error("8069 Parsing rule parameters error.");
			return true;
		}
	}
	int numberofProbationers = 0;
	time_t start, end;
	string rankName;
	for (vector<SharedPtr<CrewOnFlight>>::iterator crew = crews.begin(); crew != crews.end(); ++crew)
	{
		vector<SharedPtr<CREW_RANK>> ranks = (*crew)->crew->rankList;

		if (dateOfJoinLowwer > 0 || dateOfJoinUpper > 0) {
	
			int serviceDays = Utility::GetInstancePtr()->DaysBetween((*crew)->crew->emplUtc, nowDay);

			if (serviceDays < dateOfJoinLowwer || serviceDays > dateOfJoinUpper)
				continue;
		}

		if (vActingRanks.size() > 0)
			if (vActingRanks[0] != "*" &&
				std::find(vActingRanks.begin(), vActingRanks.end(), (*crew)->actingRank) == vActingRanks.end()
				)
				continue;
		if (vAssignmentGroups.size() > 0)
			if (vAssignmentGroups[0] != "*" &&
				std::find(vAssignmentGroups.begin(), vAssignmentGroups.end(), (*crew)->assignment) == vAssignmentGroups.end()
				)
				continue;

		for (vector<SharedPtr<CREW_RANK>>::iterator rank = ranks.begin(); rank != ranks.end(); ++rank)
		{
			start = (*rank)->effUtc;
			end = (*rank)->expUtc;

			if (end < 0)
				end = start + 10 * 365 * 24 * 60 * 60;
			if (start > nowDay || end < nowDay)
				continue;
			rankName = (*rank)->rank;

			if (vActiveRanks.size() > 0 && vActiveRanks[0] != "*" &&
				std::find(vActiveRanks.begin(), vActiveRanks.end(), rankName) == vActiveRanks.end()
				)
				continue;

			int daysBegin = 0, daysEnd = 9999;
			if (probSettings.size() > 0)
			{
				if (probSettings[0] != "*")
				{
					for (vector<string>::iterator prob = probSettings.begin(); prob != probSettings.end(); ++prob)
					{
						if ((*prob).find(rankName) != string::npos)
						{
							string range = (*prob).substr((*prob).find(":") + 1);
							daysBegin = stoi(range.substr(0, range.find("-")));
							daysEnd = stoi(range.substr(range.find("-") + 1));
						}
					}
				}
			}
			//long long start1 = start - nowDay + daysEnd * 24 * 60 * 60;
			//long long start2 = start - nowDay + daysBegin * 24 * 60 * 60;
			long prevCumDays = (*rank)->preCumulatedExpDays;
			if (!bUtilizePrev)
				prevCumDays = 0;
			if ((daysEnd * 24 * 60 * 60 >= nowDay - start + prevCumDays * 24 * 3600) && (daysBegin * 24 * 60 * 60 <= nowDay - start + prevCumDays * 24 * 3600))
			{
				numberofProbationers++;
				break;
			}

		}
	}
	return numberofProbationers;

}

int LegalityChecker::getNumberOfProbationersByQual(vector<SharedPtr<CrewOnFlight>>& crews, vector<string>& vActiveRanks, vector<string>& vActingRanks, vector<string>& vFltAssignments, string fleet, vector<string>& probSettings, time_t nowDay, const DBRule* singleRule)
{
	int numberofProbationers = 0, experienceDays, daysBegin = 0, daysEnd = 9999;;
	string qualName, range;
	for (vector<SharedPtr<CrewOnFlight>>::iterator crew = crews.begin(); crew != crews.end(); ++crew)
	{
		auto qualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs((*crew)->crew, this->_dbData->qualExtensionConfigMap);
		vector<SharedPtr<CREW_QUALIFICATION>> quals = (*crew)->crew->qualificationList;

		if (vActingRanks.size() > 0)
			if (vActingRanks[0] != "*" &&
				std::find(vActingRanks.begin(), vActingRanks.end(), (*crew)->actingRank) == vActingRanks.end()
				)
				continue;
		if (vFltAssignments.size() > 0)
			if (vFltAssignments[0] != "*")
				if (std::find(vFltAssignments.begin(), vFltAssignments.end(), (*crew)->assignment) == vFltAssignments.end())
					continue;
		experienceDays = -1;
		daysBegin = 0, daysEnd = 99999;
		for (vector<SharedPtr<CREW_QUALIFICATION>>::iterator qual = quals.begin(); qual != quals.end(); ++qual)
		{
			if (fleet != "*" && (*qual)->qual != fleet)
				continue;
			if (experienceDays > 0)
				break;
			time_t start = (*qual)->issuedUtc;
			time_t end = (*qual)->expiryUtc;
			if (end < 0)
				end = start + 10 * 365 * 24 * 60 * 60;
			if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
				auto qualPeriod = RosterUtils::GetQualExtension((*qual), qualExtensionConfigsForQualMap);
				start = std::get<0>(qualPeriod);
				end = std::get<1>(qualPeriod);
			}
			if (start > nowDay || end < nowDay)
				continue;
			qualName = (*qual)->qual;
			daysBegin = 0, daysEnd = 9999;
			int iTempExpDays = static_cast<int>(nowDay - start) / (24 * 60 * 60);
			if (probSettings.size() > 0)
			{
				if (probSettings[0] != "*")
				{
					for (vector<string>::iterator prob = probSettings.begin(); prob != probSettings.end(); ++prob)
					{
						if ((*prob).find(qualName) != string::npos)
						{
							if (iTempExpDays > experienceDays)
							{
								range = (*prob).substr((*prob).find(":") + 1);
								daysBegin = stoi(range.substr(0, range.find("-")));
								daysEnd = stoi(range.substr(range.find("-") + 1));
								experienceDays = iTempExpDays;
							}
							break;
						}
					}
				}
			}

		}
		if (experienceDays <= daysEnd && experienceDays >= daysBegin && experienceDays >= 0)
			numberofProbationers++;
	}
	return numberofProbationers;
}

int LegalityChecker::getNumberOfProbationers(vector<SharedPtr<CrewOnFlight>>& crews, vector<string>& vActingRanks, vector<string>& probSettings, time_t nowDay)
{
	int numberofProbationers = 0;
	time_t start, end;
	for (vector<SharedPtr<CrewOnFlight>>::iterator crew = crews.begin(); crew != crews.end(); crew++)
	{
		vector<SharedPtr<CREW_RANK>> ranks = (*crew)->crew->rankList;
		//vector<string>::iterator it_rank = find(vRanks.begin(), vRanks.end(), (*crew)->actingRank);

		if (vActingRanks.size() > 0 && vActingRanks[0] != "*" &&
			std::find(vActingRanks.begin(), vActingRanks.end(), (*crew)->actingRank) == vActingRanks.end()
			)
			continue;

		for (vector<SharedPtr<CREW_RANK>>::iterator rank = ranks.begin(); rank != ranks.end(); rank++)
		{
			start = (*rank)->effUtc;
			end = (*rank)->expUtc;
			if (end < 0)
				end = start + 10 * 365 * 24 * 60 * 60;
			if (start > nowDay || end < nowDay)
				continue;
			string rankName = (*rank)->rank;
			//vector<string>::iterator it_rank = find(vRanks.begin(), vRanks.end(), rankName);

			int daysBegin = 0, daysEnd = 0;
			for (vector<string>::iterator prob = probSettings.begin(); prob != probSettings.end(); prob++)
			{
				if ((*prob).find(rankName) != string::npos)
				{
					string range = (*prob).substr((*prob).find(":") + 1);
					daysBegin = stoi(range.substr(0, range.find("-")));
					daysEnd = stoi(range.substr(range.find("-") + 1));
				}
			}
			//long long start1 = start - nowDay + daysEnd * 24 * 60 * 60;
			//long long start2 = start - nowDay + daysBegin * 24 * 60 * 60;
			if ((start - nowDay + daysEnd * 24 * 60 * 60 >= 0) && (start - nowDay + daysBegin * 24 * 60 * 60 <= 0))
				numberofProbationers++;

		}
	}
	return numberofProbationers;
}


int LegalityChecker::getNumberOfProbationers(vector<SharedPtr<CrewOnFlight>>& crews, map<string, int>* probs, time_t nowDay)
{
	int numberofProbationers = 0, days;
	time_t start, end;

	for (vector<SharedPtr<CrewOnFlight>>::iterator crew = crews.begin(); crew != crews.end(); ++crew)
	{
		vector<SharedPtr<CREW_RANK>>& ranks = (*crew)->crew->rankList;
		for (vector<SharedPtr<CREW_RANK>>::iterator rank = ranks.begin(); rank != ranks.end(); ++rank)
		{
			start = (*rank)->effUtc;
			end = (*rank)->expUtc;
			if (end < 0)
				end = start + 3 * 365 * 24 * 60 * 60;
			if (start > nowDay || end < nowDay)
				continue;
			string rankName = (*rank)->rank;
			//if crew down rank, he/she must not be a probationer on the acting rank.
			if (rankName != (*crew)->actingRank)
				continue;
			map<string, int>::iterator prob = probs->find(rankName);
			if (prob != probs->end())
			{
				days = (*prob).second;
				if (start - nowDay + days * 24 * 60 * 60 >= 0)
					numberofProbationers++;
			}
		}
	}
	return numberofProbationers;
}



int LegalityChecker::getNumberOfFilledCrewPerRank(vector<SharedPtr<CrewOnFlight>> cof, vector<string> vRanks, time_t nowDay)
{
	int numberOfFilled = 0;
	time_t start, end;
	string rankName;
	if (vRanks.size() == 1 && vRanks[0] == "*")
	{
		numberOfFilled = (int)cof.size();
	}
	else
	{
		for (vector<SharedPtr<CrewOnFlight>>::iterator crew = cof.begin(); crew != cof.end(); ++crew)
		{
			vector<SharedPtr<CREW_RANK>> ranks = (*crew)->crew->rankList;
			for (vector<SharedPtr<CREW_RANK>>::iterator rank = ranks.begin(); rank != ranks.end(); ++rank)
			{
				start = (*rank)->effUtc;
				end = (*rank)->expUtc;
				if (end < 0)
					end = start + 3 * 365 * 24 * 60 * 60;
				if (start > nowDay || end < nowDay)
					continue;
				rankName = (*rank)->rank;
				vector<string>::iterator rank_it = find(vRanks.begin(), vRanks.end(), rankName);
				if (rank_it != vRanks.end())
				{
					numberOfFilled++;
					break;
				}
			}
		}
	}
	return numberOfFilled;

}

int LegalityChecker::getNumberOfPlannedCrewPerRank(const map<string, int>& plans, vector<string> vRanks)
{
	int iReturn = 0;
	if (vRanks.size() == 1 && vRanks[0] == "*")
	{
		for (auto plan = plans.begin(); plan != plans.end(); ++plan)
		{
			iReturn += (*plan).second;
		}
	}
	else
	{
		for (vector<string>::iterator rank = vRanks.begin(); rank != vRanks.end(); rank++)
		{
			auto plan = plans.find((*rank));
			if (plan != plans.end())
			{
				iReturn = iReturn + (*plan).second;
			}
		}
	}
	return iReturn;
}


//MIN_CONSECUTIVE_REST = 8078
bool LegalityChecker::checkMinConsecutiveRest(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;
	string rDOGroup, rMinTimes, rPeriod, rUnit, rRestPeriod, rRestUnit;
	bool bPostRest = false;

	try {

		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "REST ASSIGNMENT GROUPS")
				rDOGroup = headeValue;
			if (header == "MIN TIMES")
				rMinTimes = headeValue;
			if (header == "REST PERIOD")
				rRestPeriod = headeValue;
			if (header == "REST UNIT")
				rRestUnit = headeValue;
			if (header == "WINDOW PERIOD")
				rPeriod = headeValue;
			if (header == "WINDOW UNIT")
				rUnit = headeValue;
			if (header == "UTILIZE POST DUTY REST")
				bPostRest = (headeValue == "Y");
		}

		string airlinecode = this->_dbData->scenario.airline;
		vector<string> restAssignments;
		split(rDOGroup, '|', restAssignments);
	//	boost::split(restAssignments, rDOGroup, boost::is_any_of("|"), boost::token_compress_on);
		vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
		time_t rollingWindow_start, rollingWindow_end;
		if (this->GetApplication() != ROSTER_OPTIMIZER && !rosters.empty())
		{
			rollingWindow_start = rosters[0]->actStrUtc;
			rollingWindow_end = rosters[rosters.size() - 1]->actEndUtc;
		}
		else
		{
			rollingWindow_start = this->_dbData->scenario.startDtUTC;
			rollingWindow_end = this->_dbData->scenario.endDtUTC + 24 * 3600;
		}
		int iMonths = stoi(rPeriod);
		int iRestPeriod = stoi(rRestPeriod);
		int iRequiredRest = stoi(rMinTimes);
		if (rosters.size() == 0)
			return true;
		time_t tempStart = rosters[0]->actEndUtc;
		string base = Utility::GetInstancePtr()->getCrewPrimaryBase(this->_dbData->crewList[pCrew->crewIndex]->baseList, tempStart);
		int offsetMinutes = 0;
		if (base.empty())
			base = _dbData->scenario.bases[0];
		if (!base.empty())
			offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
		if (rUnit == "CM")
		{
			map<time_t, time_t> mp = Utility::GetInstancePtr()->getMonthRollingWindows(rollingWindow_start, rollingWindow_end, offsetMinutes, iMonths);
			for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); mp_it++)
			{
				time_t start = (*mp_it).first;
				time_t end = (*mp_it).second;
				vector<Rest_Ranges*> rests = Utility::GetInstancePtr()->getRestRanges(rosters, start, end, bPostRest, restAssignments);

				int iRest = 0;
				for (auto rest : rests)
				{
					if (rRestUnit == "RH")
					{
						//int iRestStart = max(start, rest->startInUtc);
						//int iRestEnd = min(end, rest->endInUtc);
						int iRestSeconds = static_cast<int>(rest->endInUtc - rest->startInUtc);
						if (iRestSeconds >= iRestPeriod * 60 * 60)
							iRest += int(iRestSeconds / (iRestPeriod * 60 * 60));
					}
				}
				if (iRest < iRequiredRest)
				{
					string msg = "The number of rests ({0:iRest}) must be at least {1:rMinTimes} in {2:rPeriod} {3:rUnit}, rest types ({4:rRestPeriod} {5:rRestUnit}).";
					msg = StringUtils::Format(msg, iRest, rMinTimes, rPeriod, rUnit, rRestPeriod, rRestUnit);

					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					//rv->rosterId = (*roster)->rosterId;
					//rv->pairingId = (*roster)->pairId;
					//rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = start;
					rv->endDTUtc = end;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("iRest", Utility::GetInstancePtr()->ToString(iRest)));
					rv->operation_result.insert(pair<string, string>("rMinTimes", rMinTimes));
					rv->operation_result.insert(pair<string, string>("rPeriod", rPeriod));
					rv->operation_result.insert(pair<string, string>("rUnit", rUnit));
					rv->operation_result.insert(pair<string, string>("rRestPeriod", rRestPeriod));
					rv->operation_result.insert(pair<string, string>("rRestUnit", rRestUnit));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
			}
		}
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("[checkMinConsecutiveRest] exception:{}", ex.what());
		bReturn = false;
	}
	return bReturn;
}




bool LegalityChecker::hasOptimizedNewRosterInRange(vector<SharedPtr<ROSTER>> rosters, time_t start, time_t end)
{
	bool bHas = false;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		if ((*roster)->actRestStrUtc >= start && (*roster)->actStrUtc <= end)
		{
			if ((*roster)->needRuleCheck)
				return true;
		}
	}
	return bHas;
}

bool LegalityChecker::checkRestAfterLongAwayBase(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkRestAfterLongAwayBase");

	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string rBase = "*", rRank = "*", rFleet = "*", rGroup = "FLY|RB", rDiff, rDaysfromBase, rMinRest, rMinLocalNights, rStart, rEnd;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "RANK")
			rRank = headeValue;
		if (header == "BASE")
			rBase = headeValue;
		if (header == "FLEET")
			rFleet = headeValue;
		if (header == "TIME ZONE DIFF")
			rDiff = headeValue;
		if (header == "#DAYS AWAY FROM HOME BASE")
			rDaysfromBase = headeValue;
		if (header == "MIN REST")
			rMinRest = headeValue;
		if (header == "MIN LOCAL NIGHTS")
			rMinLocalNights = headeValue;
		if (header == "LOCAL NIGHTS START LOC")
			rStart = headeValue;
		if (header == "LOCAL NIGHTS END LOC")
			rEnd = headeValue;
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return true;

	int iDiff = stoi(rDiff);
	int iDays = stoi(rDaysfromBase);
	int iLocalNights = stoi(rMinLocalNights);
	int iMinRest;

	std::size_t iPos = rStart.find(":");
	int startLoc, endLoc;
	if (iPos != std::string::npos)
	{
		startLoc = stoi(rStart.substr(0, iPos)) * 60 + stoi(rStart.substr(iPos + 1));
		iPos = rEnd.find(":");
		if (iPos != std::string::npos)
		{
			endLoc = stoi(rEnd.substr(0, iPos)) * 60 + stoi(rEnd.substr(iPos + 1));
		}
		else
		{
			string errorStr = "Error rule parameter:" + rEnd;
			printf(errorStr.c_str());
			return true;
		}
	}
	else
	{
		string errorStr = "Error rule parameter:" + rStart;
		printf(errorStr.c_str());
		return true;
	}
	iPos = rMinRest.find(":");
	if (iPos != std::string::npos)
	{
		iMinRest = stoi(rMinRest.substr(0, iPos)) * 60 + stoi(rMinRest.substr(iPos + 1));
	}
	else
	{
		string errorStr = "Error rule parameter:" + rMinRest;
		printf(errorStr.c_str());
		return true;
	}

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, rBase, rRank, rFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;
	vector<SharedPtr<CREW_BASE>> bases = crew->baseList;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, lCheckedStart);

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> restAssignments;
	string airline = this->_dbData->scenario.airline;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); assign++)
	{
		if ((*assign)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assign)->airline == airline))
			restAssignments.push_back((*assign)->assignemnt);
	}

	auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	string arrStation;
	//20190418 ain, mantis#5183, 改为栈对象避免 leak
	//Local_Night_Definition* local = new Local_Night_Definition();
	Local_Night_Definition local;
	local.LocalStart = rStart;
	local.LocalEnd = rEnd;
	//default setting.
	local.MinRestInterval = "00:00";
	for (std::size_t i = 0; i < rosters.size(); i++)
	{
		int iCurrent = (int)i;
		double maxTimeZoneDiff = 0;
		if (!(rosters[i]->pairing))
			continue;
		time_t rosterStart = rosters[i]->actStrUtc;
		time_t rosterEnd = rosters[i]->actRestStrUtc;

		vector<Duty *> duties = rosters[i]->pairing->getDutyVec();
		for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); duty++)
		{
			vector<Segment*> segments = (*duty)->getSegments();
			for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
			{
				arrStation = (*segment)->getArrStation();
				maxTimeZoneDiff = max(maxTimeZoneDiff, TimezoneUtils::abs((int)(this->_dbData->getAirportOffsetMinutes(arrStation)) - offsetMinutes)/60.0);
			}
		}
		string firstStation = base, lastStation = base;
		if (duties.size() > 0)
			firstStation = duties[0]->getDepStation();
		if (Utility::GetInstancePtr()->isHalfRoster(rosters[i]) && firstStation == base)
		{
			//find another half roster
			for (std::size_t j = i + 1; j < rosters.size(); j++)
			{
				if (!(rosters[j]->pairing))
					continue;
				vector<Duty *> nextDuties = rosters[j]->pairing->getDutyVec();
				if (nextDuties.size() > 0)
					lastStation = nextDuties[nextDuties.size() - 1]->getArrStation();
				for (vector<Duty *>::iterator duty = nextDuties.begin(); duty != nextDuties.end(); duty++)
				{
					vector<Segment*> segments = (*duty)->getSegments();
					for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
					{
						arrStation = (*segment)->getArrStation();
						maxTimeZoneDiff = max(maxTimeZoneDiff, TimezoneUtils::abs((int)(this->_dbData->getAirportOffsetMinutes(arrStation)) - offsetMinutes)/60.0);
					}
				}
				if (Utility::GetInstancePtr()->isHalfRoster(rosters[j]) && lastStation == base)
				{
					rosterEnd = rosters[j]->actRestStrUtc;
					iCurrent = (int)j;
					break;
				}
			}
		}

		int iDaysFromBase = static_cast<int>(Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterEnd, offsetMinutes) - Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterStart, offsetMinutes)) / (24 * 3600) + 1;

		if (maxTimeZoneDiff >= iDiff && iDaysFromBase > iDays)
		{
			//checm min rest & local nights
			time_t start = rosterEnd;
			int iNext = Utility::GetInstancePtr()->getNextWorkingRosterIndex(rosters, restAssignments, iCurrent);
			if (iNext != FAILURE)
			{
				vector<Rest_Ranges*> rests;
				Rest_Ranges* rest = new Rest_Ranges();
				rest->startInUtc = rosterEnd;
				rest->endInUtc = rosters[iNext]->actStrUtc;
				rests.push_back(rest);
				int localNights = Utility::GetInstancePtr()->hasXConsecutiveLocalNightsBeforeTm(rests, iLocalNights, rosters[iNext]->actStrUtc, local, offsetMinutes);
				int iRest = static_cast<int>(rosters[iNext]->actStrUtc - rosterEnd) / 60;
				if (localNights < iLocalNights || iRest < iMinRest)
				{
					if (this->_application == ROSTER_OPTIMIZER
						&& !(rosters[i]->needRuleCheck)
						&& !(rosters[iCurrent]->needRuleCheck)
						&& !(rosters[iNext]->needRuleCheck)
						)
						continue;
					bReturn = false;
					string msg = "After " + Utility::GetInstancePtr()->ToString(iDaysFromBase) + " days away from base and a timezone difference of (";
					msg += Utility::GetInstancePtr()->ToString(maxTimeZoneDiff)+"), the crew rest period (rest=";
					msg += Utility::GetInstancePtr()->formatMinutes(iRest) + ") is less than the minimum rest(";
					msg += rMinRest + ") or doesn't have ";
					msg += rMinLocalNights + " local nights between rosters[";
					msg += Utility::GetInstancePtr()->ToString(rosters[iCurrent]->rosterId) + "," + Utility::GetInstancePtr()->ToString(rosters[iNext]->rosterId) + "].";
					this->setLegalityMessage(rosters[iCurrent], pCrew, singleRule, msg);
					pCrew->isLegal = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = rosters[i]->rosterId;
					//rv->pairingId = (*roster)->pairId;
					//rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = rosterStart;
					rv->endDTUtc = rosterEnd;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("iDaysFromBase", Utility::GetInstancePtr()->ToString(iDaysFromBase)));
					rv->operation_result.insert(pair<string, string>("maxTimeZoneDiff", Utility::GetInstancePtr()->ToString(maxTimeZoneDiff)));
					rv->operation_result.insert(pair<string, string>("iRest", Utility::GetInstancePtr()->formatMinutes(iRest)));
					rv->operation_result.insert(pair<string, string>("rMinRest", rMinRest));
					rv->operation_result.insert(pair<string, string>("rMinLocalNights", rMinLocalNights));
					rv->operation_result.insert(pair<string, string>("iCurrentRosterId", Utility::GetInstancePtr()->ToString(rosters[iCurrent]->rosterId)));
					rv->operation_result.insert(pair<string, string>("iNextRosterId", Utility::GetInstancePtr()->ToString(rosters[iNext]->rosterId)));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
				rests.pop_back();
				delete rest;
				rest = NULL;

			}
		}
	}
	//delete local;
	//local = NULL;
	return bReturn;
}

bool LegalityChecker::checkDaysOffAfterAttribute(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkDaysOffAfterAttribute");

	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string airlinecode = this->_dbData->scenario.airline;
	string rAttribute, rMinDO, rGroup, rBase = "*", rRank = "*", rFleet = "*", strMonth = "*";
	bool  rPostRest = false, rCountBlankDay = false;
	vector<string> rDoAssignments;
	//DO ASSIGNMENT GROUP,MIN DO,PERIOD,UNIT,UTILIZE POST DUTY REST,COUNT BLANK DAY
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "RANK")
			rRank = headeValue;
		if (header == "BASE")
			rBase = headeValue;
		if (header == "FLEET")
			rFleet = headeValue;
		if (header == "DO ASSIGNMENT") {
			if (!headeValue.empty() && headeValue != "*") {
				split(headeValue, '|', rDoAssignments);
			}
		}
		if (header == "DO ASSIGNMENT GROUP")
			rGroup = headeValue;
		if (header == "PATTERN ATTRIBUTE")
			rAttribute = headeValue;
		if (header == "MIN DO")
			rMinDO = headeValue;
		if (header == "UTILIZE POST DUTY REST")
			rPostRest = (headeValue == "Y");
		if (header == "COUNT BLANK DAY")
			rCountBlankDay = (headeValue == "Y");
		if (header == "NO. MONTH") {
			strMonth = headeValue;
		}
	}
	int iRequiredDO = stoi(rMinDO);
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	if (rosters.size() == 0)
		return true;

	tm tempTm = { 0 };
	time_t startUtc;
	int iMonth = 1;
	try
	{
		if (strMonth != "*")
			iMonth = stoi(strMonth);

		if (iMonth > 12)
			iMonth = 12;
	}
	catch (string e)
	{
		Logger::getRuleLogger()->error("[8027]Parsing rule parameters error.");
		return true;
	}

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, rBase, rRank, rFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> restAssignments, daysOffs;
	string airline = this->_dbData->scenario.airline;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); assign++)
	{
		if ((*assign)->assignmentGroup == rGroup && (this->_dbData->version == 3 || (*assign)->airline == airline))
			daysOffs.push_back((*assign)->assignemnt);
		if ((*assign)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assign)->airline == airline))
			restAssignments.push_back((*assign)->assignemnt);
	}
	daysOffs.insert(daysOffs.end(), rDoAssignments.begin(), rDoAssignments.end());
	
	int index = Utility::GetInstancePtr()->getFirstAttributeRoster(rosters, rAttribute);

	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, lCheckedStart);
	string baseCountry = this->_dbData->findAirportCountry(base);
	int offsetMinutes = 0;
	if (base.empty())
		base = _dbData->scenario.bases[0];
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	time_t start, end;
	while (index != FAILURE)
	{
		int iCurrentIndex = index;
		bool needMovingHome = false;
		int iNext = -1;
		if (baseCountry != this->_dbData->findAirportCountry(rosters[iCurrentIndex]->location))
		{
			time_t iRestStrDt = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[iCurrentIndex]->actRestStrUtc, offsetMinutes);
			iNext = Utility::GetInstancePtr()->getNextWorkingRosterIndex(rosters, restAssignments, iCurrentIndex);

			if (iNext >= 0 && Utility::GetInstancePtr()->isHalfRoster(rosters[iNext]) &&
				rosters[iNext]->actStrUtc - iRestStrDt < 2 * 24 * 3600)
			{
				iCurrentIndex = iNext;
			}
			else
			{
				// 長班隔天需moving回base, 如果找不到moving或是moving不是在長班的隔天, 則長班的隔天需要保留給moving
				needMovingHome = true;
			}
		}
		if (rPostRest)
			start = rosters[iCurrentIndex]->actRestStrUtc;
		else
			start = rosters[iCurrentIndex]->actEndUtc;

		time_t temp = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offsetMinutes);
		if (temp == start)
			end = temp + iRequiredDO * 24 * 3600;
		else
			end = temp + (iRequiredDO + 1) * 24 * 3600;

		if (needMovingHome)
			end += 24 * 3600;

		int iDaysOff, iStartMonth, iEndMonth;

		//op1433,增加MONTH参数
		// mantis#5083, 任務結束時間加2天跨入本月份和任務結束時間在本月份都要列入法規控管
		startUtc = (end - 60) - offsetMinutes * 60;
#ifdef _WIN32
		_gmtime32_s(&tempTm, (__time32_t *)&startUtc);
#else
		gmtime_r(&startUtc, &tempTm);
#endif
		iEndMonth = tempTm.tm_mon + 1;

		startUtc = start - offsetMinutes * 60;
#ifdef _WIN32
		_gmtime32_s(&tempTm, (__time32_t *)&startUtc);
#else
		gmtime_r(&startUtc, &tempTm);
#endif
		iStartMonth = tempTm.tm_mon + 1;

		if (strMonth == "*" || iStartMonth == iMonth || iEndMonth == iMonth)
		{
			if (!rCountBlankDay)
				iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end);
			else {
				int nextWorkIndex = Utility::GetInstancePtr()->getNextWorkingRosterIndex(rosters, restAssignments, iCurrentIndex);
				if (nextWorkIndex > 0 && nextWorkIndex < rosters.size()) {
					end = min(rosters[nextWorkIndex]->actStrUtc, end);
				}
				iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, offsetMinutes, rCountBlankDay, rPostRest, this->_dbData->airportCodeMap);
			}
			if (iDaysOff < iRequiredDO || (needMovingHome && iDaysOff == iRequiredDO))
			{
				if (this->_application == ROSTER_OPTIMIZER)
				{
					if (!hasOptimizedNewRosterInRange(rosters, rosters[index]->actStrUtc, end))
					{
						index = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, iCurrentIndex, rAttribute);
						continue;
					}
				}
				bReturn = false;
				string msg = "Days off(" + Utility::GetInstancePtr()->ToString(iDaysOff)+") after roster(" + Utility::GetInstancePtr()->ToString(rosters[iCurrentIndex]->rosterId);
				msg += ") with attribute(" + rAttribute + ") ";
				msg = msg + "is less than " + rMinDO;
				if (needMovingHome)
				{
					msg += " + 1 for moving";
				}
				this->setLegalityMessage(rosters[index], pCrew, singleRule, msg);
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->rosterId = rosters[index]->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = start;
				rv->endDTUtc = end;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("label", rosters[index]->label));
				rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
				rv->operation_result.insert(pair<string, string>("iCurrentIndexRosterId", Utility::GetInstancePtr()->ToString(rosters[iCurrentIndex]->rosterId)));
				rv->operation_result.insert(pair<string, string>("rAttribute", rAttribute));
				if (needMovingHome)
				{
					rv->operation_result.insert(pair<string, string>("rMinDO", rMinDO + " + 1 for moving"));
				}
				else
				{
					rv->operation_result.insert(pair<string, string>("rMinDO", rMinDO));
				}
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}
		}
		index = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, iCurrentIndex, rAttribute);
	}

	return bReturn;
}

// 8088
bool LegalityChecker::checkCommute(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	if (singleRule->tableNum == 1)
		return true;

	if (pCrew->crewIndex < 0)
		return true;
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() < 1)
		return true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string pBases, pRanks, pFleets, pExceptions = "*";
	//table 2
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			pBases = headeValue;
		}
		if (header == "RANKS") {
			pRanks = headeValue;
		}
		if (header == "FLEETS") {
			pFleets = headeValue;
		}
		if (header == "EXCEPTIONAL ASSIGNMENTS FOR NEXT ROSTER") {
			pExceptions = headeValue;
		}
	}

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBases, pRanks, pFleets, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<string> exceptions;
	split(pExceptions, '|', exceptions);
//	boost::split(exceptions, pExceptions, boost::is_any_of("|"), boost::token_compress_on);

	for (std::size_t i = 0; i + 1 < rosters.size(); ++i)
	{
		if (this->_application == ROSTER_OPTIMIZER && !(rosters[i]->needRuleCheck))
			continue;
		if (!(rosters[i]->communt > 0))
			continue;
		if (std::find(exceptions.begin(), exceptions.end(), rosters[i + 1]->duty) != exceptions.end())
			continue;
		if (!(rosters[i]->pairing))
			continue;
		int allRestBetweenRosters = static_cast<int>(rosters[i + 1]->actStrUtc - rosters[i]->actRestStrUtc) / 60;
		if (allRestBetweenRosters < 0)
			allRestBetweenRosters = 0;
		int minRest = 0;
		int minCommute = 0;
		const vector<Duty *>& duties = rosters[i]->pairing->getDutyVec();
		int minRestOfRoster = rosters[i]->dutyValues.getMinRest(duties.size() - 1);
		minRest = minRestOfRoster > 0 ? minRestOfRoster : duties[duties.size() - 1]->getMinRest();
		minCommute = rosters[i]->communt;

		if (allRestBetweenRosters < minRest + minCommute)
		{
			//if (crew->idCrew == "F56737")
			//	printf("");
			if (isCallinStandby(rosters[i], rosters[i + 1]))
				continue;

			string msg = "The actual rest period ({0:allRestBetweenRostersHHmm}) between {1:currRosterLabel} and {2:nextRosterLabel} is less than the minimum rest ({3:minRestHHmm}) with buffer ({4:minCommuteHHmm}).";
			msg = StringUtils::Format(msg, Utility::GetInstancePtr()->formatMinutes(allRestBetweenRosters), rosters[i]->label, rosters[i + 1]->label, 
				Utility::GetInstancePtr()->formatMinutes(minRest), Utility::GetInstancePtr()->formatMinutes(minCommute));

			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage(rosters[i], pCrew, singleRule, msg);
			pCrew->isLegal = false;
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crew->idCrew;
			rv->rosterId = rosters[i]->rosterId;
			rv->pairingId = rosters[i]->pairId;
			//rv->dutySequenceNumber = duty->getDutySegNum();
			//rv->segmentId = segment->getDBId();
			rv->startDTUtc = rosters[i]->actStrUtc;
			rv->endDTUtc = rosters[i + 1]->actStrUtc;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("actualRest", Utility::GetInstancePtr()->formatMinutes(allRestBetweenRosters)));
			rv->operation_result.insert(pair<string, string>("roster1", rosters[i]->label));
			rv->operation_result.insert(pair<string, string>("roster2", rosters[i + 1]->label));
			rv->operation_result.insert(pair<string, string>("minRest", Utility::GetInstancePtr()->formatMinutes(minRest)));
			rv->operation_result.insert(pair<string, string>("minCommute", Utility::GetInstancePtr()->formatMinutes(minCommute)));
			rv->violation_msg = msg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
	}

	return bReturn;
}






//only for Roster optimizer: OP1599
bool LegalityChecker::checkProbationbyRank(SharedPtr<CREW>& crew, Pairing* pg, string actingRank, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	string header, headeValue;
	string strDefinition, strValue;

	string rAttribute, rFleet, rProbation, rActingRank, rActiveRank, rMinProb, rMaxProb, remark, rGroups = "*", rDateOfJoinRange = "*";
	bool bUtilizePrev = false;
	for (map<string, string>::const_iterator iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		//Active Ranks,Acting Ranks,Current Rank Experienced Days,Pattern Attribute,Flight Fleets,Min Limits,Max Limits
		if (header == "ACTIVE RANKS")
			rActiveRank = headeValue;
		if (header == "ACTING RANKS")
			rActingRank = headeValue;
		if (header == "CURRENT RANK EXPERIENCED DAYS")
			rProbation = headeValue;
		if (header == "PATTERN ATTRIBUTE")
			rAttribute = headeValue;
		if (header == "FLIGHT FLEETS")
			rFleet = headeValue;
		if (header == "MIN LIMITS")
			rMinProb = headeValue;
		if (header == "FLIGHT ASSIGNMENT GROUPS")
			rGroups = headeValue;
		if (header == "MAX LIMITS")
			rMaxProb = headeValue;
		if (header == "REMARK")
			remark = headeValue;
		//Utilize Previous Experience
		if (header == "UTILIZE PREVIOUS EXPERIENCE")
			bUtilizePrev = (headeValue == "Y");
		if (header == "DATE OF JOIN RANGE")
			rDateOfJoinRange = headeValue;
	}
	if (rMinProb == "*" || rMaxProb == "*")
	{
		printf("Excetpion in 8069: Probation check, the min/max setting must be digit. Ignore this rule checking.\n");
		return true;
	}


	//0002017: [8069]预占的2个AP down到CA超出了8069限制，不应该阻挡正常的CA分配
	bool isQualified = Utility::GetInstancePtr()->isCrewQualified(crew, "*", rActiveRank, "*", "*", "*", this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600);
	if (!isQualified)
		return true;

	string attributes = pg->getAttribute();
	if (rAttribute != "*" && attributes.find(rAttribute) == string::npos)
		return true;

	vector<string> sFleets, sActiveRanks, sActingRanks, sProbs;
	split(rActingRank, '|', sActingRanks);
//	boost::split(sActingRanks, rActingRank, boost::is_any_of("|"), boost::token_compress_on);
	if (rActingRank != "*" && std::find(sActingRanks.begin(), sActingRanks.end(), actingRank) == sActingRanks.end())
		return true;
	split(rFleet, '|', sFleets);
	split(rActiveRank, '|', sActiveRanks);
	split(rProbation, '|', sProbs);
//	boost::split(sFleets, rFleet, boost::is_any_of("|"), boost::token_compress_on);
//	boost::split(sActiveRanks, rActiveRank, boost::is_any_of("|"), boost::token_compress_on);
//	boost::split(sProbs, rProbation, boost::is_any_of("|"), boost::token_compress_on);
	int iNumOfProbationers;
	long long flt_id;
	string fleet, flightNum;

	vector<string> vAssignmentGroups, vAssignments;
	split(rGroups, '|', vAssignmentGroups);
//	boost::split(vAssignmentGroups, rGroups, boost::is_any_of("|"), boost::token_compress_on);
	vector<SharedPtr<DBRule_8014>>& asnGroup = this->_dbData->rule_8014;
	if (rGroups != "*")
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = asnGroup.begin(); assignment != asnGroup.end(); ++assignment)
		{
			if (std::find(vAssignmentGroups.begin(), vAssignmentGroups.end(), (*assignment)->assignmentGroup) != vAssignmentGroups.end()
				&& (this->_dbData->version == 3 || (*assignment)->airline == this->_dbData->scenario.airline))
			{
				vAssignments.push_back((*assignment)->assignemnt);
			}
		}
	}
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;

	int iMin = stoi(rMinProb);
	int iMax = stoi(rMaxProb);

	vector<Duty *> duties = pg->getDutyVec();
	for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
	{
		const vector<Segment*>& segments = (*duty)->getSegments();
		for (auto segment = segments.begin(); segment != segments.end(); ++segment)
		{
			if (!((*segment)->getIsOperating()))
				continue;

			flt_id = (*segment)->getDBId();
			fleet = (*segment)->getFleetCD();

			if (rGroups != "*" && find(vAssignments.begin(), vAssignments.end(), (*segment)->getAssignment()) == vAssignments.end())
				continue;

			if (rFleet != "*" && find(sFleets.begin(), sFleets.end(), fleet) == sFleets.end())
				continue;
			if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
			{
				vector<SharedPtr<CrewOnFlight>> crews = crewsOnFlt.find(flt_id)->second;
				auto& plans = (*segment)->getPlanComposition();

				SharedPtr<CrewOnFlight> thisCrew = make_shared<CrewOnFlight>();
				thisCrew->actingRank = actingRank;
				thisCrew->crew = crew;
				thisCrew->fltId = flt_id;
				thisCrew->pairingId = pg->getDbId();
				thisCrew->assignment = "FLY";
				crews.push_back(thisCrew);

				iNumOfProbationers = getNumberOfProbationers(crews, sActiveRanks, sActingRanks, sProbs, (*segment)->getStartTimeUtcAct(), vAssignments, rDateOfJoinRange, bUtilizePrev);
				if (iNumOfProbationers > iMax || iNumOfProbationers < iMin)
				{
					return false;
				}

			}
		}
	}

	return bReturn;
}

bool LegalityChecker::checkProbationbyRank(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	string header, headeValue;
	string strDefinition, strValue;

	string rAttributes, rFleet, rProbation, rActingRank, rActiveRank, rMinProb, rMaxProb, remark, rGroups = "*", rDateOfJoinRange = "*";
	vector<string> attributeList;
	bool bUtilizePrev = false;
	for (map<string, string>::const_iterator iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		//Active Ranks,Acting Ranks,Current Rank Experienced Days,Pattern Attribute,Flight Fleets,Min Limits,Max Limits
		if (header == "ACTIVE RANKS")
			rActiveRank = headeValue;
		if (header == "ACTING RANKS")
			rActingRank = headeValue;
		if (header == "CURRENT RANK EXPERIENCED DAYS")
			rProbation = headeValue;
		if (header == "PATTERN ATTRIBUTE")
			rAttributes = headeValue;
		if (header == "FLIGHT FLEETS")
			rFleet = headeValue;
		if (header == "MIN LIMITS")
			rMinProb = headeValue;
		if (header == "FLIGHT ASSIGNMENT GROUPS")
			rGroups = headeValue;
		if (header == "MAX LIMITS")
			rMaxProb = headeValue;
		if (header == "REMARK")
			remark = headeValue;
		//Utilize Previous Experience
		if (header == "UTILIZE PREVIOUS EXPERIENCE")
			bUtilizePrev = (headeValue == "Y");
		if (header == "DATE OF JOIN RANGE")
			rDateOfJoinRange = headeValue;
	}
	split(rAttributes, '|', attributeList);
	if (rMinProb == "*" || rMaxProb == "*")
	{
		printf("Excetpion in 8069: Probation check, the min/max setting must be digit. Ignore this rule checking.\n");
		return true;
	}

	SharedPtr<CREW> crew;
	if (pCrew->crewIndex >= 0)
		crew = this->_dbData->crewList[pCrew->crewIndex];
	else
	{
		printf("Exception: crewIndex is invalide.\n");
		return true;
	}
	//0002017: [8069]预占的2个AP down到CA超出了8069限制，不应该阻挡正常的CA分配
	bool isQualified = Utility::GetInstancePtr()->isCrewQualified(crew, "*", rActiveRank, "*", "*", "*", this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600);
	if (!isQualified)
		return true;

	vector<string> vAssignmentGroups, vAssignments;
	split(rGroups, '|', vAssignmentGroups);
//	boost::split(vAssignmentGroups, rGroups, boost::is_any_of("|"), boost::token_compress_on);
	vector<SharedPtr<DBRule_8014>>& asnGroup = this->_dbData->rule_8014;
	if (rGroups != "*")
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = asnGroup.begin(); assignment != asnGroup.end(); ++assignment)
		{
			if (std::find(vAssignmentGroups.begin(), vAssignmentGroups.end(), (*assignment)->assignmentGroup) != vAssignmentGroups.end()
				&& (this->_dbData->version == 3 || (*assignment)->airline == this->_dbData->scenario.airline))
			{
				vAssignments.push_back((*assignment)->assignemnt);
			}
		}
	}

	vector<string> sFleets, sActiveRanks, sActingRanks, sProbs;
	split(rFleet, '|', sFleets);
	split(rActiveRank, '|', sActiveRanks);
	split(rActingRank, '|', sActingRanks);
	split(rProbation, '|', sProbs);
	/*boost::split(sFleets, rFleet, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(sActiveRanks, rActiveRank, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(sActingRanks, rActingRank, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(sProbs, rProbation, boost::is_any_of("|"), boost::token_compress_on);*/


	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	int iMin = stoi(rMinProb);
	int iMax = stoi(rMaxProb);

	int numberOfPlanned, numberOfFilled, iNumOfProbationers;
	long long flt_id;
	string fleet, flightNum;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
		if (this->_application == ROSTER_OPTIMIZER && !((*roster)->needRuleCheck))
			continue;

		if (rActingRank != "*" && std::find(sActingRanks.begin(), sActingRanks.end(), (*roster)->actingRank) == sActingRanks.end())
			continue;

		//if ((*roster)->rosterId == 91267643 && rActingRank=="AP")
		//	printf("");
		if ((*roster)->pairing)
		{
			string attributes = (*roster)->pairing->getAttribute();
			
			bool foundAttribute = false;
			for (const auto & attr : attributeList) {
				if (attributes.find(attr) != string::npos) {
					foundAttribute = true;
					break;
				}
			}
			if (rAttributes == "*")
				foundAttribute = true;
			if (!foundAttribute)
				continue;

			vector<Duty *> duties = (*roster)->pairing->getDutyVec();
			for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
			{
				vector<Segment*> segments = (*duty)->getSegments();
				for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
				{
					if (!((*segment)->getIsOperating()))
						continue;

					if (RosterUtils::ExistExceptionCode((*roster).get(), (*segment), singleRule->exceptionCodes, _dbData)) {
						continue;
					}					flt_id = (*segment)->getDBId();
					fleet = (*segment)->getFleetCD();

					if (rGroups != "*" && find(vAssignments.begin(), vAssignments.end(), (*segment)->getAssignment()) == vAssignments.end())
						continue;

					if (rFleet != "*" && find(sFleets.begin(), sFleets.end(), fleet) == sFleets.end())
						continue;
					if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
					{
						vector<SharedPtr<CrewOnFlight>>& crews = crewsOnFlt.find(flt_id)->second;
						int sumPlans = 0, sumCrew = 0;
						//  mantis#5117, iMin > 0時才需要考慮plan配比
						if (iMin > 0)
						{
							// mantis#5117, sumPlans應計算航班上所有pairing符合rank的composition
							vector<long long>fltPairingList = this->_dbData->fltToPairingMap[(*segment)->getDBId()];
							for (auto& iter_pairing : fltPairingList)
							{
								long long pairingId = iter_pairing;
								Pairing* flt_pairing = this->_dbData->pairingIdMap[pairingId];
								map<string, int>& complementMap = flt_pairing->getComplements();
								for (auto it_actingRank : sActingRanks)
								{
									if (complementMap.find(it_actingRank) != complementMap.end())
									{
										sumPlans += complementMap[it_actingRank];
									}
								}
							}
							//map<string, int>& plans = (*segment)->getPlanComposition();
							//for (auto plan : plans){
							//	if (find(sActingRanks.begin(), sActingRanks.end(), plan.first) != sActingRanks.end()){
							//		sumPlans += plan.second;
							//	}
							//}
							for (auto cr : crews){
								if (find(sActingRanks.begin(), sActingRanks.end(), cr->actingRank) != sActingRanks.end()){
									sumCrew++;
								}
							}
						}
						iNumOfProbationers = getNumberOfProbationers(crews, sActiveRanks, sActingRanks, sProbs, (*segment)->getStartTimeUtcAct(), vAssignments, rDateOfJoinRange, bUtilizePrev);
						if (iNumOfProbationers > iMax || (iMin > 0 && sumPlans - sumCrew + iNumOfProbationers < iMin))
						{
							if (this->_application == ROSTER_OPTIMIZER && iMin > 0 && iNumOfProbationers < iMin && iNumOfProbationers <= iMax)
							{
								//numberOfPlanned = getNumberOfPlannedCrewPerRank(plans, sActingRanks);
								numberOfPlanned = sumPlans;
								numberOfFilled = getNumberOfFilledCrewPerRank(crews, sActingRanks, (*segment)->getStartTimeUtcAct());
								if (iMin - iNumOfProbationers <= numberOfPlanned - numberOfFilled && numberOfPlanned > 0 &&
									numberOfPlanned >= numberOfFilled)
								{
									continue;
								}
							}
							char strBuf[100] = { 0 };
							utcToUtcStr((*segment)->getStartTimeLocSch(), strBuf, sizeof(strBuf));
							flightNum = (*segment)->getSegNumber() + "/" + string(strBuf).substr(0, 10);
							string rExperienced = (iMin > 0) ? "experienced" : "inexperienced";
							string msg = remark + "The number of " + rExperienced + " crews(" + Utility::GetInstancePtr()->ToString(iNumOfProbationers);
							msg += ") on flight(" + flightNum + ") based on the parameters(Active Ranks=" + rActiveRank + ",Acting Ranks=" + rActingRank;
							msg += ",Flight Fleets=" + rFleet + ",Attributes=" + joinStrList(attributeList, "|") + ",experienced days=" + rProbation;
							msg += ") doesn't meet the requirement(min=" + rMinProb + ",max=" + rMaxProb + ").";

							pCrew->legalMessage.push_back(msg);
							this->setLegalityMessage((*segment), singleRule, msg);
							pCrew->isLegal = false;
							pCrew->skipCheckInLaterIterations = true;
							bReturn = false;
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
							rv->rosterId = (*roster)->rosterId;
							rv->pairingId = (*roster)->pairId;
							rv->dutySequenceNumber = (*duty)->getDutySegNum();
							rv->segmentId = (*segment)->getDBId();
							rv->startDTUtc = (*segment)->getStartTimeUtcAct();
							rv->endDTUtc = (*segment)->getEndTimeUtcAct();
							rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
							//OP#1448提供message参数给gantt
							rv->operation_result.insert(pair<string, string>("remark", remark));
							rv->operation_result.insert(pair<string, string>("rExperienced", rExperienced));
							rv->operation_result.insert(pair<string, string>("iNumOfProbationers", Utility::GetInstancePtr()->ToString(iNumOfProbationers)));
							rv->operation_result.insert(pair<string, string>("flightNum", flightNum));
							//rv->operation_result.insert(pair<string, string>("rActiveRank", rActiveRank));
							rv->operation_result.insert(pair<string, string>("rActingRank", rActingRank));
							//rv->operation_result.insert(pair<string, string>("rFleet", rFleet));
							//rv->operation_result.insert(pair<string, string>("rAttribute", rAttribute));
							//rv->operation_result.insert(pair<string, string>("rProbation", rProbation));
							rv->operation_result.insert(pair<string, string>("rMinProb", rMinProb));
							rv->operation_result.insert(pair<string, string>("rMaxProb", rMaxProb));
							rv->violation_msg = msg;
							this->addRuleViolations(rv, singleRule);
							if (this->GetApplication() == ROSTER_OPTIMIZER){
								return false;
							}
						}

					}
				}
			}
		}
	}

	return bReturn;
}

bool LegalityChecker::checkProbationbyQual(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	string header, headeValue;
	string strDefinition, strValue;

	string rAttribute, rFleet, rProbation, rActingRank, rActiveRank, rMinProb, rMaxProb, remark, rGoups = "OPR";
	for (map<string, string>::const_iterator iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		//Active Ranks,Acting Ranks,Qualification Experienced Days,Pattern Attribute,Flight Fleets,Min Limits,Max Limits,Remark
		if (header == "ACTIVE RANKS")
			rActiveRank = headeValue;
		if (header == "ACTING RANKS")
			rActingRank = headeValue;
		if (header == "QUALIFICATION EXPERIENCED DAYS")
			rProbation = headeValue;
		if (header == "PATTERN ATTRIBUTE")
			rAttribute = headeValue;
		if (header == "FLIGHT FLEETS")
			rFleet = headeValue;
		if (header == "MIN LIMITS")
			rMinProb = headeValue;
		if (header == "MAX LIMITS")
			rMaxProb = headeValue;
		if (header == "REMARK")
			remark = headeValue;
		if (header == "SEGMENT ASSIGNMENT GROUPS")
			rGoups = headeValue;
	}
	if (rMinProb == "*" || rMaxProb == "*")
	{
		printf("Excetpion in 8070: Probation check, the min/max setting must be digit. Ignore this rule checking.\n");
		return true;
	}

	vector<string> sFleets, sActiveRanks, sActingRanks, sProbs, sGroups;
	split(rFleet, '|', sFleets);
	split(rActiveRank, '|', sActiveRanks);
	split(rActingRank, '|', sActingRanks);
	split(rProbation, '|', sProbs);
	split(rGoups, '|', sGroups);
	/*boost::split(sFleets, rFleet, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(sActiveRanks, rActiveRank, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(sActingRanks, rActingRank, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(sProbs, rProbation, boost::is_any_of("|"), boost::token_compress_on);
	boost::split(sGroups, rGoups, boost::is_any_of("|"), boost::token_compress_on);
*/
	vector<SharedPtr<DBRule_8014>>& asnGroup = this->_dbData->rule_8014;

	vector<string> vAssignments;
	vector<string>::iterator isGroupMatched;
	//rDutyGroup
	if (rGoups != "*")
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = asnGroup.begin(); assignment != asnGroup.end(); ++assignment)
		{
			if (std::find(sGroups.begin(), sGroups.end(), (*assignment)->assignmentGroup) != sGroups.end())
			{
				vAssignments.push_back((*assignment)->assignemnt);
			}
		}
	}

	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;

	int iMin = stoi(rMinProb);
	int iMax = stoi(rMaxProb);

	int numberOfPlanned, numberOfFilled, iNumOfProbationers;
	long long flt_id;
	string fleet, flightNum;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
		if (this->_application == ROSTER_OPTIMIZER && !((*roster)->needRuleCheck))
			continue;

		if (rActingRank != "*" && std::find(sActingRanks.begin(), sActingRanks.end(), (*roster)->actingRank) == sActingRanks.end())
			continue;

		//		if ((*roster)->pairId == 165863)
		//			printf("");
		if ((*roster)->pairing)
		{
			string attributes = (*roster)->pairing->getAttribute();
			if (rAttribute != "*" && attributes.find(rAttribute) == string::npos)
				continue;

			vector<Duty *> duties = (*roster)->pairing->getDutyVec();
			for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
			{
				vector<Segment*> segments = (*duty)->getSegments();
				for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
				{
					if (rGoups != "*" && vAssignments.size() > 0 && std::find(vAssignments.begin(), vAssignments.end(), (*segment)->getAssignment()) == vAssignments.end())
						continue;

					if (!((*segment)->getIsOperating()))
						continue;

					flt_id = (*segment)->getDBId();
					fleet = (*segment)->getFleetCD();
					if (rFleet != "*" && find(sFleets.begin(), sFleets.end(), fleet) == sFleets.end())
						continue;
					if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
					{
						vector<SharedPtr<CrewOnFlight>>& crews = crewsOnFlt.find(flt_id)->second;
						auto& plans = (*segment)->getPlanComposition();
						//0002394: 優化結果違反8070且未報錯
						//iNumOfProbationers = getNumberOfProbationersByQual(crews, sActiveRanks, sActingRanks, vAssignments,fleet, sProbs, (*segment)->getStartTimeUtcAct());
						iNumOfProbationers = getNumberOfProbationersByQual(crews, sActiveRanks, sActingRanks, vAssignments, "*", sProbs, (*segment)->getStartTimeUtcAct(), singleRule);
						if (iNumOfProbationers > iMax || iNumOfProbationers < iMin)
						{
							if (this->_application == ROSTER_OPTIMIZER && iNumOfProbationers < iMin)
							{
								numberOfPlanned = getNumberOfPlannedCrewPerRank(plans, sActingRanks);
								numberOfFilled = getNumberOfFilledCrewPerRank(crews, sActingRanks, (*segment)->getStartTimeUtcAct());
								if (iMin - iNumOfProbationers <= numberOfPlanned - numberOfFilled && numberOfPlanned > 0 &&
									numberOfPlanned >= numberOfFilled)
								{
									continue;
								}
							}
							char strBuf[100] = { 0 };
							utcToUtcStr((*segment)->getStartTimeLocSch(), strBuf, sizeof(strBuf));
							flightNum = (*segment)->getSegNumber() + "/" + string(strBuf).substr(0, 10);
							string msg = remark + "The number of crews(" + Utility::GetInstancePtr()->ToString(iNumOfProbationers);
							msg += ") on flight(" + flightNum + ") based on the parameters(Active Ranks=" + rActiveRank + ",Acting Ranks=" + rActingRank;
							msg += ",Flight Fleets=" + rFleet + ",Attributes=" + rAttribute + ",experienced days=" + rProbation;
							msg += ") doesn't meet the requirement(min=" + rMinProb + ",max=" + rMaxProb + ").";
							pCrew->legalMessage.push_back(msg);
							this->setLegalityMessage((*segment), singleRule, msg);
							pCrew->isLegal = false;
							bReturn = false;
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
							rv->rosterId = (*roster)->rosterId;
							rv->pairingId = (*roster)->pairId;
							rv->dutySequenceNumber = (*duty)->getDutySegNum();
							rv->segmentId = (*segment)->getDBId();
							rv->startDTUtc = (*segment)->getStartTimeUtcAct();
							rv->endDTUtc = (*segment)->getEndTimeUtcAct();
							rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
							//OP#1448提供message参数给gantt
							//rv->operation_result.insert(pair<string, string>("remark", remark));
							rv->operation_result.insert(pair<string, string>("iNumOfProbationers", Utility::GetInstancePtr()->ToString(iNumOfProbationers)));
							rv->operation_result.insert(pair<string, string>("rFleet", (*segment)->getFleetCD()));
							rv->operation_result.insert(pair<string, string>("flightNum", flightNum));
							//rv->operation_result.insert(pair<string, string>("rActiveRank", rActiveRank));
							//rv->operation_result.insert(pair<string, string>("rActingRank", rActingRank));
							//rv->operation_result.insert(pair<string, string>("rAttribute", rAttribute));
							//rv->operation_result.insert(pair<string, string>("rProbation", rProbation));
							rv->operation_result.insert(pair<string, string>("rMaxProb", rMaxProb));
							rv->operation_result.insert(pair<string, string>("rMinProb", rMinProb));
							rv->violation_msg = msg;
							this->addRuleViolations(rv, singleRule);
							if (this->GetApplication() == ROSTER_OPTIMIZER){
								return false;
							}
						}

					}
				}
			}
		}
	}

	return bReturn;
}



vector<SharedPtr<CREW_MANDAY_CC_AM>> LegalityChecker::calculateMandayCC(SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>> rosters, bool isDebug) {
	return calMandaysCcAmByAllRosters(this, data, crew, rosters, isDebug);
}
vector<SharedPtr<CREW_MANDAY_FD>> LegalityChecker::calculateMandayFD(SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>> rosters) {
	return calMandaysFdByAllRosters(this, data, crew, rosters);
}


//8055 MIN_QAL_PER_FLEET_RANK_EVA
bool LegalityChecker::checkMinQualByFleetAndRank(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	string rFleet, rActingRank, rMinTimes, rQualification, strDep, strArr, rAttribute, rCrewNationality = "*", rRequired = "99", rGroups = "*";

	rule8055* cache = (rule8055*)singleRule->parsedParam.get();
	rFleet = cache->rFleet;
	rActingRank = cache->rActingRank;
	rMinTimes = cache->rMinTimes;
	rQualification = cache->rQualification;
	strDep = cache->strDep;
	strArr = cache->strArr;
	rAttribute = cache->rAttribute;
	rCrewNationality = cache->rCrewNationality;
	rRequired = cache->rRequired;
	rGroups = cache->rGroups;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;

	vector<string>& strDepps = cache->strDepps;
	vector<string>& strArrs = cache->strAttributes;
	vector<string>& strFleets = cache->strFleets;
	vector<string>& strAttributes = cache->strAttributes;
	vector<string>& vAssignmentGroups = cache->vAssignmentGroups;
	vector<string>& vAssignments = cache->vAssignments;
	int iTimes = cache->iTimes;
	int iRequired = cache->iRequired;

	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	string airline = this->_dbData->scenario.airline;
	string crewid = crew->idCrew;
	string fltFleet, fltDep, fltArr, fltAttr;
	long long flt_id;
	time_t rankEnd;

	int numberOfQualfied = 0;
	int numberOfQualfiedAndQCA = 0;
	int numberOfQCAOnly = 0;
	int numberOfRequired = 0;
	bool hasQual = false, hasQCA = false, bCountForeignCAE = false;
	//for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	for (auto& roster : rosters)
	{
		//if ((*roster)->rosterId == 101139114 && ( rQualification=="QCA"))
		//	printf("ok");
		//ignore the violation of the pre-assigned roster for RO
		//optimize for the consideration of RO performance
		if (this->GetApplication() == ROSTER_OPTIMIZER && (roster->source != "CR" || !(roster->needRuleCheck)))
			continue;

		if (rActingRank != "*" && rActingRank != roster->actingRank)
			continue;

		if (!(roster->pairing))
			continue;

		if (rAttribute != "*")
		{
			fltAttr = roster->pairing->getAttribute();
			//Does fltAttr contains one of strAttributes
			bool bHas = false;

			for (vector<string>::iterator oneAtt = strAttributes.begin(); oneAtt != strAttributes.end(); ++oneAtt)
			{
				if (fltAttr.find((*oneAtt)) != std::string::npos)
				{
					bHas = true;
					break;
				}
			}
			if (!bHas)
				continue;
		}
		int numberOfPlanned = 0, numberOfFilled = 0;
		for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
		{
			Duty* duty = roster->pairing->getDuty(di);
			//for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
			for (std::size_t si = 0; si < duty->getNumSegments(); si++)
			{
				numberOfPlanned = 0, numberOfFilled = 0;
				Segment* segment = duty->getSegment(si);
				fltFleet = segment->getFleetCD();
				//if (((*segment)->getFleetCD() != rFleet) || !((*segment)->getIsOperating()))
				if (rFleet != "*" && ((std::find(strFleets.begin(), strFleets.end(), fltFleet) == strFleets.end()) || !(segment->getIsOperating())))
					continue;

				fltDep = segment->getDepStation();
				//if (strDep != "*" && strDep != (*segment)->getDepStation())
				if (strDep != "*" && std::find(strDepps.begin(), strDepps.end(), fltDep) == strDepps.end())
					continue;

				fltArr = segment->getArrStation();
				//if (strArr != "*" && strArr != (*segment)->getArrStation())
				if (strArr != "*" && std::find(strArrs.begin(), strArrs.end(), fltArr) == strArrs.end())
					continue;

				if (rGroups != "*" && std::find(vAssignments.begin(), vAssignments.end(), segment->getAssignment()) == vAssignments.end())
					continue;

				flt_id = segment->getDBId();
				//if (flt_id == 47807107)
				//	printf("");
				//long long qualEnd, rankEnd;
				time_t start = segment->getStartTimeUtcAct();
				time_t end = segment->getEndTimeUtcAct();
				numberOfQualfied = 0;
				numberOfQualfiedAndQCA = 0;
				numberOfQCAOnly = 0;
				numberOfFilled = 0;
				hasQual = false, hasQCA = false, bCountForeignCAE = false;
				if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
				{
					vector<SharedPtr<CrewOnFlight>>& cofOfCrew = crewsOnFlt.find(flt_id)->second;

					auto& plans = (segment)->getPlanComposition();

					auto plan = plans.find(rActingRank);
					if (plan != plans.end())
					{
						numberOfPlanned = (*plan).second;
					}

					//for (vector<SharedPtr<CrewOnFlight>>::iterator crew = crews.begin(); crew != crews.end(); ++crew)
					for (auto& cof : cofOfCrew)
					{
						if (rGroups != "*" && std::find(vAssignments.begin(), vAssignments.end(), cof->assignment) == vAssignments.end())
							continue;
						//0001857: [8055]欧洲四腿班CAE人数满足，但是外籍所在的pairing误告警
						if ((cof->actingRank != rActingRank && rActingRank != "*") ||
							((cof->actingRank == "AP" || cof->actingRank == "CA") && iRequired < 99))
							continue;
						else
							numberOfFilled++;

						if (rCrewNationality != "*" && rCrewNationality != cof->crew->nationality)
							continue;

						hasQual = false, hasQCA = false;

						//eva specific logic
						bool isDownCA = false, bRankCAE = false;
						vector<SharedPtr<CREW_RANK>> cofRanks = cof->crew->rankList;
						//for (vector<SharedPtr<CREW_RANK>>::iterator rank = cofRanks.begin(); rank != cofRanks.end(); ++rank)
						for (auto& rank : cofRanks)
						{
							rankEnd = rank->expUtc;
							if (rankEnd < 0)
								rankEnd = end + 24 * 3600;
							if (rank->effUtc <= start && (rankEnd >= end))
							{
								//if (rank->rank == "AP")
								if ((rank->rank == "AP" || rank->rank == "DP") && cof->actingRank == "CA")
									isDownCA = true;
								//0003341: [8085]因應B82配置調整，需修改QCA資歷天數
								//if ((rank->rank == "CA" && start - rank->effUtc + rank->preCumulatedExpDays * 24 * 3600 > 180 * 24 * 3600 && cof->crew->nationality == "TW") ||
								if ((rank->rank == "CA" && start - rank->effUtc + rank->preCumulatedExpDays * 24 * 3600 > 365 * 24 * 3600 && cof->crew->nationality == "TW") ||
									((rank->rank == "AP" || rank->rank == "DP") && cof->actingRank == "CA" && cof->crew->nationality == "TW"))
									if (airline == "BR" && (rQualification == "CAE" || rQualification == "QCA"))
										hasQCA = true;
							}

						}

						//vector<SharedPtr<CREW_QUALIFICATION>>& quals = cof->crew->qualificationList;
						//for (vector<SharedPtr<CREW_QUALIFICATION>>::iterator qual = quals.begin(); qual != quals.end(); ++qual)
						auto qualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(cof->crew, this->_dbData->qualExtensionConfigMap);
						for (auto& qual : cof->crew->qualificationList)
						{
							time_t qualStart = qual->issuedUtc;
							time_t qualEnd = qual->expiryUtc;
							if (qualEnd < 0)
								qualEnd = end + 24 * 3600;
							if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
								auto qualPeriod = RosterUtils::GetQualExtension(qual, qualExtensionConfigsForQualMap);
								qualStart = std::get<0>(qualPeriod);
								qualEnd = std::get<1>(qualPeriod);
							}
							if ((qual->qual == rQualification) && (qualStart <= start) && (qualEnd >= end))
							{
								if (!hasQual)
								{
									hasQual = true;
								}
							}
							if ((qual->qual == "QCA") && (qualStart <= start) && (qualEnd >= end))
							{
								if (cof->crew->nationality == "TW")
									hasQCA = true;
							}
						}

						//eva specific logic
						if (airline == "BR" && rQualification == "CAE" && cof->actingRank == "CA")
						{
							if ((hasQual || isDownCA) && (cof->crew->nationality != "TW") && !bCountForeignCAE)
							{
								bCountForeignCAE = true;
								numberOfQualfied++;
								hasQual = true;
							}
							else if ((hasQual || isDownCA) && (cof->crew->nationality == "TW"))
							{
								numberOfQualfied++;
								hasQual = true;
							}

						}
						else if (airline == "BR" && rQualification == "QCA" && cof->actingRank == "CA")
						{
							if (hasQCA)
								numberOfQualfied++;
						}
						else if (airline == "BR" && rQualification == "CAE" && cof->actingRank == "AP")
						{
							if (hasQual || isDownCA)
								numberOfQualfied++;
						}
						else
						{
							if (hasQual)
								numberOfQualfied++;
						}
						if (hasQCA && hasQual)
							numberOfQualfiedAndQCA++;
						if (hasQCA && !hasQual)
							numberOfQCAOnly++;
					}

					//担任QCA就不能担任CAE
					if (airline == "BR" && numberOfQCAOnly == 0 && numberOfQualfiedAndQCA > 0 && rQualification == "CAE")
						numberOfQualfied = numberOfQualfied - 1;
					/*欧洲4腿Pairing, 超过required数量执行actring Rank 额外组员可以担任CAE职责
					欧洲4腿用attribute表示，无需额外逻辑*/
					if (airline == "BR" && numberOfFilled > iRequired && rQualification == "CAE")
						numberOfQualfied += numberOfFilled - iRequired;
				}

				if (numberOfQualfied < iTimes)
				{
					if (this->_application == ROSTER_OPTIMIZER)
					{
						if (numberOfQCAOnly == 0 && numberOfQualfiedAndQCA == 0 && rQualification != "QCA")
						{
							//by default QCA is 1
							//0001819: 法规8055，逐条处理的问题。
							if (numberOfPlanned - numberOfFilled >= iTimes - numberOfQualfied + 1)
								continue;
						}
						else
						{
							if (numberOfPlanned - numberOfFilled >= iTimes - numberOfQualfied)
								continue;
						}
					}

					//stringstream 代替 string+运算
					stringstream ss;
					ss << "The number crew(" << numberOfQualfied << ") with valid qualication(" << rQualification + ") on flight(";
					ss <<  segment->getSegNumber() << "/" << utcToUtcString(segment->getStartTimeLocSch()).substr(0, 10);
					ss << "," << rFleet << ") and acting rank(";
					ss << rActingRank << ") is less than " << rMinTimes << ", Parameters(" << strDep << "-" << strArr << ",attribute=" << rAttribute << "),current composition(";
					ss << "planned/filled=" << numberOfPlanned << "/" << numberOfFilled << ").";
					string msg = ss.str();

					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(segment, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = roster->rosterId;
					rv->pairingId = roster->pairId;
					rv->dutySequenceNumber = duty->getDutySegNum();
					rv->segmentId = segment->getDBId();
					rv->startDTUtc = segment->getStartTimeUtcAct();
					rv->endDTUtc = segment->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("numberOfQualfied", Utility::GetInstancePtr()->iToa(numberOfQualfied)));
					rv->operation_result.insert(pair<string, string>("rQualification", rQualification));
					rv->operation_result.insert(pair<string, string>("SegNumber", segment->getSegNumber()));
					rv->operation_result.insert(pair<string, string>("", utcToUtcString(segment->getStartTimeLocSch()).substr(0, 10)));
					rv->operation_result.insert(pair<string, string>("rFleet", rFleet));
					rv->operation_result.insert(pair<string, string>("rActingRank", rActingRank));
					rv->operation_result.insert(pair<string, string>("rMinTimes", rMinTimes));
					rv->operation_result.insert(pair<string, string>("strDep", strDep));
					rv->operation_result.insert(pair<string, string>("strArr", strArr));
					rv->operation_result.insert(pair<string, string>("rAttribute", rAttribute));
					rv->operation_result.insert(pair<string, string>("numberOfPlanned", Utility::GetInstancePtr()->iToa(numberOfPlanned)));
					rv->operation_result.insert(pair<string, string>("numberOfFilled", Utility::GetInstancePtr()->iToa(numberOfFilled)));
					rv->violation_msg = msg;
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
			}
		}
	}

	return bReturn;
}

inline static std::map<string, int> mergeFleetLandingAndTakeOff(const std::map<string, int>& fleetLanding, const std::map<string, int>& fleetTakeoff) {
    std::map<string, int> operatingFleets = fleetLanding;
    for (auto& kv : fleetTakeoff) {
		auto iter = operatingFleets.find(kv.first);
        if (iter == operatingFleets.end()) {
			operatingFleets[kv.first] = kv.second;
		}
		else {
            //如果一个机型在当天既有降落又有起飞，应该取两者的较大值
			operatingFleets[kv.first] = std::max(operatingFleets[kv.first],  kv.second);
		}
	}
	return operatingFleets;
}

//8054 CREW_FLEET_RECENCY
bool LegalityChecker::checkCrewFleetRecency(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	rule8054 * cache = (rule8054 *)singleRule->parsedParam.get();
	string rFleet = cache->rFleet;
	string rCrewBase = cache->rCrewBase;
	string rCrewRank = cache->rCrewRank;
	string rCrewFleet = cache->rCrewFleet;
	string rOperate = cache->rOperate;;
	string rAssignment = cache->rAssignment;
	string rActingRank = cache->rActingRank;
	string rQual = cache->rQual;
	string rUnit = cache->rUnit;
	int iGapCD = cache->iGapCD;
	int iMinTimes = cache->iTimes;
	map<string, bool>& rosterActingRank = cache->actingRankMap;
	map<string, bool>& segmentAssignment = cache->assignmentMap;
	vector<string> recencyFleetList = cache->recencyFleetList;
	vector<string> qualifications = cache->qualifications;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	vector<SharedPtr<CREW_MANDAY_FD>>& cfd = crew->mandayFdList;
	vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, rCrewBase, rCrewRank, rCrewFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	//mantis#1958, 数据结构修改 unordered_set<recency>
	string crewid = crew->idCrew;
	bool isFd = (crew->division == "P");
	
	for (SharedPtr<ROSTER>& roster : rosters)
	{

		if (!(roster->pairing))
			continue;
		//ignore the violation of the pre-assigned roster for RO
		if (this->GetApplication() == ROSTER_OPTIMIZER && roster->source != "CR")
			continue;
		//mantis#2222, rule param增加 acting rank
		//mantis#2298, actingRank != ruleParam.actingRank --> find() == .end()
		if (rActingRank != "*" && rosterActingRank.find(roster->actingRank) == rosterActingRank.end())
			continue;

		for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
		{
			Duty * duty = roster->pairing->getDuty(di);
			for (std::size_t si = 0; si < duty->getNumSegments(); si++)
			{
				Segment * segment = duty->getSegment(si);
				if (rFleet != "*" && find(recencyFleetList.begin(), recencyFleetList.end(), segment->getFleetCD()) == recencyFleetList.end())
					continue;
				//mantis#2222, rule param增加 seg.assignment, skip seg if seg.assignment not match rule.assignment
				if (rAssignment != "*" && segmentAssignment.find(segment->getAssignment()) == segmentAssignment.end())
					continue;

				time_t start = segment->getStartTimeUtcAct();
				time_t end = segment->getEndTimeUtcAct();
				if (rQual != "*") {
					const auto& crewQualifications = crew->qualificationList;
					bool hasQual = false;
					for (const auto& q : qualifications) {
						for (const auto& qual : crewQualifications) {
							if (qual->qual == q) {
								time_t qualStart = qual->issuedUtc;
								time_t qualEnd = qual->expiryUtc;
								if (qualEnd < 0)
									qualEnd = end + 24 * 3600;
								if (qual->expiryUtc && qualStart <= start && qualEnd >= end && qual->isValid) {
									hasQual = true;
									break;
								}
							}
						}
						if (hasQual)
							break;
					}
					if (hasQual)
						continue;					
				}

				time_t recencyWindowStartUtc = 0;
				if (rUnit == "CD") {
					recencyWindowStartUtc = start - (time_t)iGapCD * 24 * 3600;
				}
				else if (rUnit == "MS") {
					const auto & startOfMonth = Utility::GetInstancePtr()->getLocalMonthStartInUTC(start, 0);
					recencyWindowStartUtc = TimeUtils::AddMonth(startOfMonth, 0, -1 * iGapCD);
				}
				else {
					return true;
				}

				int iRecency = 0;

				string depZoneId = this->_dbData->getAirportZoneId(segment->getDepStation());
				const auto& offset = TimezoneUtils::GetTimezoneOffset(start, depZoneId);
				const auto& startOfDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offset);

				if (isFd) {
					for (const auto& manday : cfd) {
						if (manday->crewDateUtc < recencyWindowStartUtc || manday->crewDateUtc >= startOfDay)
							continue;

						std::map<string, int> operatingFleets = manday->operating_fleets;
						if (_dbData->scenario.airline == "TG") {
							//飞行针对TG使用manday中fleetLanding和fleetTakeoff机型
							operatingFleets = mergeFleetLandingAndTakeOff(manday->fleetLanding, manday->fleetTakeoff);
						}
						//BR的FD manday里记录了实际飞行的fleet，其他航司的FD manday里没有fleet信息，默认每条manday记录1次recency
						if (rFleet != "*") {
							for (const auto& fleet : recencyFleetList) {
								if (operatingFleets.find(fleet) != operatingFleets.end()) {
									iRecency += operatingFleets.at(fleet);
								}
							}
						}
						else {
							iRecency += (int)operatingFleets.size();
						}
						if (iRecency >= iMinTimes)
							break;
					}
				}
				else {
					for (const auto& manday : cabin) {
						if (manday->crewDateUtc < recencyWindowStartUtc || manday->crewDateUtc >= startOfDay)
							continue;

						if (rFleet != "*") {
							for (const auto& fleet : recencyFleetList) {
								if (manday->operating_fleets.find(fleet) != manday->operating_fleets.end()) {
									iRecency += manday->operating_fleets.at(fleet);
								}
							}
						}
						else {
							iRecency += (int)manday->operating_fleets.size();
						}
						if (iRecency >= iMinTimes)
							break;
					}
				}
				
				
				
				if (iRecency < iMinTimes)
				{
					stringstream ss;
					ss << "The number of crew with recency for fleet(" << rFleet << ") in the last " << iGapCD << " calendar days (";
					ss << iRecency << ") " << " for airports(" << segment->getDepStation() << " " << segment->getArrStation() << ") is less than " << iMinTimes << ".";
					string msg = ss.str();
					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(segment, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = roster->rosterId;
					rv->pairingId = roster->pairId;
					rv->dutySequenceNumber = duty->getDutySegNum();
					rv->segmentId = segment->getDBId();
					rv->startDTUtc = segment->getStartTimeUtcAct();
					rv->endDTUtc = segment->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("rFleet", rFleet));
					rv->operation_result.insert(pair<string, string>("iGapCD", Utility::GetInstancePtr()->iToa(iGapCD)));
					rv->operation_result.insert(pair<string, string>("iRecency", Utility::GetInstancePtr()->iToa(iRecency)));
					rv->operation_result.insert(pair<string, string>("rOperate", rOperate));
					rv->operation_result.insert(pair<string, string>("DepStation", segment->getDepStation()));
					rv->operation_result.insert(pair<string, string>("ArrStation", segment->getArrStation()));
					rv->operation_result.insert(pair<string, string>("iMinTimes", Utility::GetInstancePtr()->iToa(iMinTimes)));
					rv->violation_msg = msg;
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
			}
		}
	}

	return bReturn;
}

vector<SharedPtr<CrewRecency>> LegalityChecker::getExpiringRecency(SharedPtr<CREW>& crew)
{
	vector<SharedPtr<CrewRecency>> expiringRecencies;

	//vector<DBRule> tempList = filterRules(this->_dbData->ruleList, this->GetApplication());

	//mantis#2074, 按func分类索引
	for (const DBRule& singleRule : this->_dbData->getRuleFunctions(AIRPORT_RECENCY_TKOLDG))
	{
		//if (singleRule.function != AIRPORT_RECENCY_TKOLDG)
		//    continue;

		auto& parameter = singleRule.params;


		map<string, string>::const_iterator iter;

		string header, headeValue;
		string strDefinition, strValue;

		string rRank, rFleet, rAiport, rOperate, rRequiredTimes, rRecencyPeriod, rUnit;
		bool bUseProjected;
		string rRenewBuffer, rRenewUnit;
		//RANK,FLEET,AIRPORT,OPERATE,REQUIRED TIMES,RECENCY PERIOD,UNIT,USE PROJECTED DATA
		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "RANK")
				rRank = headeValue;
			if (header == "FLEET")
				rFleet = headeValue;
			if (header == "USE PROJECTED DATA")
				bUseProjected = (headeValue == "Y");
			if (header == "AIRPORT")
				rAiport = headeValue;
			if (header == "OPERATE")
				rOperate = headeValue;
			if (header == "REQUIRED TIMES")
				rRequiredTimes = headeValue;
			if (header == "RECENCY PERIOD")
				rRecencyPeriod = headeValue;
			if (header == "UNIT")
				rUnit = headeValue;
			if (header == "RENEW BUFFER")
				rRenewBuffer = headeValue;
			if (header == "RENEW UNIT")
				rRenewUnit = headeValue;
		}
		if (rAiport.size() == 0)
			continue;
		int iRequiredTimes = stoi(rRequiredTimes);
		int iRequiredDays = 0;
		iRequiredDays = stoi(rRecencyPeriod);
		if (rUnit == "M")
			iRequiredDays = iRequiredDays * 30;

		int renewBuffer = stoi(rRenewBuffer);
		if (rRenewUnit == "M")
			renewBuffer = renewBuffer * 30;

		//mantis#1958, 数据结构改为 unordered_set<recency>
		string crewid = crew->idCrew;
		map<string, RecencyMapWithHashAndEqual>& recenciesmap = this->_dbData->recencyMgr.getRecencyMap();
		const auto& it = recenciesmap.find(crewid);
		RecencyMapWithHashAndEqual recencies;
		if (it != recenciesmap.end())
			recencies = (*it).second;


		for (auto& recencyClass : recencies)
		{
			for (auto& recency : recencyClass.second) {
				time_t expiringTime = recency->crewDateUtc + iRequiredDays * 24 * 60 * 60 - renewBuffer * 24 * 60 * 60;
				bool fleetFound = false;
				for (std::size_t f = 0; f < crew->fleetList.size(); f++)
				{
					SharedPtr<CREW_FLEET> crewfleet = crew->fleetList[f];
					if (crewfleet->fleet == recency->fleet || rFleet == "*")
					{
						if ((crewfleet->effUtc == -1 || crewfleet->effUtc <= expiringTime) && (crewfleet->expUtc == -1 || expiringTime <= crewfleet->expUtc))
						{
							fleetFound = true;
							break;
						}
					}

				}
				if (fleetFound == false)
					continue;

				bool rankFound = false;
				for (std::size_t r = 0; r < crew->rankList.size(); r++)
				{
					SharedPtr<CREW_RANK> crewrank = crew->rankList[r];
					if (crewrank->rank == recency->actingRank || rRank == "*")
					{
						if ((crewrank->effUtc == -1 || crewrank->effUtc <= expiringTime) && (crewrank->expUtc == -1 || expiringTime <= crewrank->expUtc))
						{
							rankFound = true;
							break;
						}
					}

				}
				if (rankFound == false)
					continue;

				//if ((!bUseProjected) && recency->status == "P")
				//continue;

				if (expiringTime >= this->_dbData->scenario.startDtUTC && expiringTime <= this->_dbData->scenario.endDtUTC + 24 * 3600)
				{
					expiringRecencies.push_back(recency);
				}
			}
		}

	}

	return expiringRecencies;

}


bool LegalityChecker::isPairingRenewRecency(SharedPtr<CREW>& crew, Pairing* pg, SharedPtr<CrewRecency> recency)
{
	bool legal = false;

	//vector<DBRule> tempList = filterRules(this->_dbData->ruleList, this->GetApplication());
	//mantis#2074, 按func分类
	for (auto& singleRule : this->_dbData->getRuleFunctions(AIRPORT_RECENCY_TKOLDG))
	{
		//DBRule singleRule = _appRules[iRule];
		//if (singleRule.function != AIRPORT_RECENCY_TKOLDG)
		//    continue;

		auto& parameter = singleRule.params;
		map<string, string>::const_iterator iter;

		string header, headeValue;
		string strDefinition, strValue;

		string rRank, rFleet, rAiport, rOperate, rRequiredTimes, rRecencyPeriod, rUnit;
		bool bUseProjected = false;
		//RANK,FLEET,AIRPORT,OPERATE,REQUIRED TIMES,RECENCY PERIOD,UNIT,USE PROJECTED DATA
		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "RANK")
				rRank = headeValue;
			if (header == "FLEET")
				rFleet = headeValue;
			if (header == "USE PROJECTED DATA")
				bUseProjected = (headeValue == "Y");
			if (header == "AIRPORT")
				rAiport = headeValue;
			if (header == "OPERATE")
				rOperate = headeValue;
			if (header == "REQUIRED TIMES")
				rRequiredTimes = headeValue;
			if (header == "RECENCY PERIOD")
				rRecencyPeriod = headeValue;
			if (header == "UNIT")
				rUnit = headeValue;
		}
		if (rAiport.size() == 0)
			continue;
		int iRequiredTimes = stoi(rRequiredTimes);
		int iRequiredDays = 0;
		iRequiredDays = stoi(rRecencyPeriod);
		if (rUnit == "M")
			iRequiredDays = iRequiredDays * 30;

		string crewid = crew->idCrew;

		time_t expiringTime = (recency)->crewDateUtc + iRequiredDays * 24 * 60 * 60;
		bool fleetFound = false;
		for (std::size_t f = 0; f < crew->fleetList.size(); f++)
		{
			SharedPtr<CREW_FLEET> crewfleet = crew->fleetList[f];
			if (crewfleet->fleet == (recency)->fleet || rFleet == "*")
			{
				if ((crewfleet->effUtc == -1 || crewfleet->effUtc <= expiringTime) && (crewfleet->expUtc == -1 || expiringTime <= crewfleet->expUtc))
				{
					fleetFound = true;
					break;
				}
			}
		}

		if (fleetFound == false)
			continue;

		bool rankFound = false;
		for (std::size_t r = 0; r < crew->rankList.size(); r++)
		{
			SharedPtr<CREW_RANK> crewrank = crew->rankList[r];
			if (crewrank->rank == (recency)->actingRank || rRank == "*")
			{
				if ((crewrank->effUtc == -1 || crewrank->effUtc <= expiringTime) && (crewrank->expUtc == -1 || expiringTime <= crewrank->expUtc))
				{
					rankFound = true;
					break;
				}
			}

		}
		if (rankFound == false)
			continue;

		vector<Duty *> duties = pg->getDutyVec();
		for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); duty++)
		{
			vector<Segment*> segments = (*duty)->getSegments();
			for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
			{
				if (!(*segment)->getIsOperating())
					continue;
				string fleet = (*segment)->getFleetCD();
				if (rFleet != fleet && rFleet != "*")
					continue;
				time_t depTime = (*segment)->getStartTimeUtcAct();
				string dep = (*segment)->getDepStation();
				string arr = (*segment)->getArrStation();

				if ((recency)->operate != rOperate)
					continue;
				if ((rOperate == "LDG" && (recency)->arvAirport != arr) && (rAiport != "*" || rAiport == recency->arvAirport))
					continue;
				if ((rOperate == "TO" && (recency)->depAirport != dep) && (rAiport != "*" || rAiport == recency->depAirport))
					continue;
				if (rOperate == "OPR" && (recency)->depAirport != dep && (rAiport != "*" || rAiport == recency->depAirport))
					continue;
				if ((!bUseProjected) && (recency)->status == "P")
					continue;

				return true;
			}
		}

	}

	return legal;
}



//8059
bool LegalityChecker::checkPercentageOfExpCrew(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	//rule params
	rule8059 * cache = (rule8059*)singleRule->parsedParam.get();
	string strBase = cache->strBase;
	string strRank = cache->strRank;
	string strAssignment = cache->strAssignment;
	double percentageOfQCA = cache->percentageOfQCA;
	int    iQualifyDays = cache->iQualifyDays;


	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	//vector<SharedPtr<CREW_BASE>> bases = crew->baseList;
	//vector<SharedPtr<CREW_RANK>> ranks = crew->rankList;
	vector<SharedPtr<CREW_PREFERENCE>>& preferences = crew->preferenceList;
	map<long long, list<SharedPtr<CrewOnFlight>>>& copList = this->_dbData->crewOnPairing;
	int offsetMinutes = this->_dbData->getCrewBaseOffsetMinutes(crew->idCrew, this->_dbData->scenario.startDtUTC);
	string crewId = crew->idCrew;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0, rosterStart, rosterEnd;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		//if (pCrew->RosterIndex >= 0 && rosters[pCrew->RosterIndex]->actingRank == strRank && strRank != "*")
		//	return true;

		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	double numberOfPlanned = 0.0, iRequired = 0.0;
	//int iFilled = 0;

	long long pairingId = 0;//64 bit
	map<string, int>::iterator plan;
	list<SharedPtr<CrewOnFlight>> crews;
	vector<SharedPtr<CREW_RANK>> cofRanks;
	map<long long, list<SharedPtr<CrewOnFlight>>>::iterator crews_it;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
		if (!((*roster)->pairing))
			continue;
		if (this->_application == ROSTER_OPTIMIZER && !((*roster)->needRuleCheck))
			continue;
		if (strAssignment != "*" && (*roster)->duty != strAssignment)
			continue;
		if (strBase != "*" && (*roster)->pairing->getBase() != strBase)
			continue;
		rosterStart = (*roster)->actStrUtc;
		rosterEnd = (*roster)->restStrUtc;

		if (!(Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, rosterStart, rosterEnd)))
			continue;
		pairingId = (*roster)->pairing->getDbid();
		map<string, int>& planValueMap = (*roster)->pairing->getComplements();
		if (planValueMap.find(strRank) == planValueMap.end() || planValueMap[strRank] <= 0) {
			continue;
		}
		numberOfPlanned = planValueMap[strRank];

		crews_it = copList.find(pairingId);
		if (crews_it != copList.end())
		{
			crews = (*crews_it).second;
			double iTotalOfQCrews = 0.0;
			int iFilled = 0;
			int iOpen = 0;
			int iLegalCrew = 0;
			for (list<SharedPtr<CrewOnFlight>>::iterator crew = crews.begin(); crew != crews.end(); ++crew)
			{
				if ((*crew)->actingRank == strRank)
				{
					cofRanks = (*crew)->crew->rankList;
					int iQCAdays = -1;
					//for (vector<SharedPtr<CREW_RANK>>::iterator rank = cofRanks.begin(); rank != cofRanks.end(); ++rank)
					for (SharedPtr<CREW_RANK>& crewrank : cofRanks)
					{
						//assumptions: crew must be qualified as the rank or downgrade into the rank
						if ((crewrank->expUtc < 0 || crewrank->expUtc > rosterEnd) && (crewrank->effUtc <= rosterStart))
						{
							if (crewrank->rank == strRank)
							{
								//iQCAdays = max(iQCAdays,(rosterStart - crewrank->effUtc) / (24 * 3600));
								iQCAdays = static_cast<int>(rosterStart - crewrank->effUtc) / (24 * 3600) + crewrank->preCumulatedExpDays;
								break;
							}
						}
					}
					//downgrade or qualify as rank
					if (iQCAdays < 0 || iQCAdays >= 90)
						iTotalOfQCrews++;
					iFilled++;

					if (iQCAdays >= iQualifyDays)
						iLegalCrew++;
				}
			}
			iRequired = numberOfPlanned*percentageOfQCA;

			iOpen = (int)(numberOfPlanned - iFilled);
			iOpen = iOpen < 0 ? 0 : iOpen;

			//20170103 mod by ain, 避免除0异常:
			//mantis#2180, 是否违规判断条件按RO/Editor不同
			//RO  
			//    openValue + legalFillValue >= percantage * planValue, 
			//    解释：当剩余openValue全部符合要求也无法满足 percentage时则提前报错。
			//    如plan = 4 per = 50 % qualify = 180，若已存在三个不符合180，则即使第四个符合180总体也无法满足50%
			//Editor
			//    legalFillValue >= percantage * planValue, 
			//    解释：editor阶段不只看当前状态是否满足require
			bool isLegal = true;
			if (this->GetApplication() == ROSTER_OPTIMIZER) {
				if (iOpen + iLegalCrew < iRequired && numberOfPlanned > 0.0)
					isLegal = false;
			}
			else {
				if (iLegalCrew < iRequired && numberOfPlanned > 0.0)
					isLegal = false;
			}
			if (!isLegal)
			{
				int iTemp = static_cast<int>((iTotalOfQCrews / numberOfPlanned) * 10 + 0.5);
				stringstream ss;
				ss << "The number of qualified crew (" << iLegalCrew << ") avaliable";
				if (this->GetApplication() == ROSTER_OPTIMIZER) { //mantis#2180, RO阶段警告增加open信息
					ss << " + open(" << iOpen << ")";
				}
				ss << " for the acting rank(" << strRank << ") and base(" << strBase << ")";
				ss << " must be at least " << iRequired;
				ss << ",Parameters(Percentage of QCA=" << percentageOfQCA << ",Planned crew=" << numberOfPlanned << ").";
				string msg = ss.str();
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(crew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->rosterId = (*roster)->rosterId;
				rv->startDTUtc = (*roster)->actStrUtc;
				rv->endDTUtc = (*roster)->actEndUtc;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iLegalCrew", Utility::GetInstancePtr()->iToa(iLegalCrew)));
				rv->operation_result.insert(pair<string, string>("Application", Utility::GetInstancePtr()->iToa(this->GetApplication())));
				rv->operation_result.insert(pair<string, string>("iOpen", Utility::GetInstancePtr()->iToa(iOpen)));
				rv->operation_result.insert(pair<string, string>("strRank", strRank));
				rv->operation_result.insert(pair<string, string>("strBase", strBase));
				rv->operation_result.insert(pair<string, string>("iRequired", Utility::GetInstancePtr()->iToa((int)iRequired)));
				rv->operation_result.insert(pair<string, string>("percentageOfQCA", Utility::GetInstancePtr()->iToa((int)percentageOfQCA)));
				rv->operation_result.insert(pair<string, string>("numberOfPlanned", Utility::GetInstancePtr()->iToa((int)numberOfPlanned)));
				rv->violation_msg = msg;
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}
		}
	}

	return bReturn;
}


bool LegalityChecker::checkMaxDowngradeInAScenario(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	//Only support RO
	//if (this->_application != ROSTER_OPTIMIZER)
	//	return bReturn;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strActiveRank = "*", strActingRank, strMax, strMaxBH;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "ACTIVE RANK")
			strActiveRank = headeValue;
		if (header == "ACTING RANK")
			strActingRank = headeValue;
		if (header == "MAX CROSS RANK TIMES")
			strMax = headeValue;
		if (header == "MAX CROSS RANK BH")
			strMaxBH = headeValue;
	}

	vector<SharedPtr<CREW>>& crews = this->_dbData->crewList;
	SharedPtr<CREW> crew = crews[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<ROSTER>> checkRosters;
	if (this->_application == ROSTER_OPTIMIZER)
		checkRosters.push_back(rosters[pCrew->RosterIndex]);
	else
		checkRosters = crew->rosterList;

	time_t lCheckedStart = this->_dbData->scenario.startDtUTC;
	time_t lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;

	int iMax = stoi(strMax);
	int iMaxBh = 0;

	bool isCross = false;

	string activeRank;
	for (vector<SharedPtr<ROSTER>>::iterator roster = checkRosters.begin(); roster != checkRosters.end(); ++roster)
	{
		//0001129: 8053法规违规应只对downrank的组员警告
		if (strActingRank != "*" && strActingRank != (*roster)->actingRank)
			continue;

		if (this->_application == ROSTER_OPTIMIZER && (*roster)->source != "CR")
			continue;

		for (vector<SharedPtr<CREW_RANK>>::iterator rank = ranks.begin(); rank != ranks.end(); ++rank)
		{
			if (((*rank)->effUtc > (*roster)->actStrUtc) || ((*rank)->rank == strActingRank))
				continue;
			//0001129: 8053法规违规应只对downrank的组员警告
			if (strActiveRank != "*" && strActiveRank != (*rank)->rank)
				continue;

			if ((*rank)->expUtc == NULL || (*rank)->expUtc < 0 || (*rank)->expUtc >(*roster)->actStrUtc)
				if (strActingRank != (*rank)->rank)
				{
					isCross = true;
					activeRank = (*rank)->rank;
					break;
				}
		}
		if (isCross)
			break;
	}
	if (!isCross)
		return true;
	if (activeRank != strActiveRank && strActiveRank != "*")
		return true;

	int iTotalOfDowngrade = 0, iTotalOfDowngradeBH = 0;

	if (strActiveRank != "*")
	{
		iTotalOfDowngrade = RuleStatistics::GetInstancePtr()->getNumberOfDowngrade(activeRank, strActingRank);
		iTotalOfDowngradeBH = RuleStatistics::GetInstancePtr()->getNumberOfBlockDowngrade(activeRank, strActingRank);
	}
	else
	{
		const map<string, int>& numberOfDowngrade = RuleStatistics::GetInstancePtr()->getNumberOfDowngrade();
		const map<string, int>& numberOfBlockDowngrade = RuleStatistics::GetInstancePtr()->getNumberOfBlockDowngrade();

		if (numberOfDowngrade.find(strActingRank) != numberOfDowngrade.end())
			iTotalOfDowngrade = numberOfDowngrade.find(strActingRank)->second;

		if (numberOfBlockDowngrade.find(strActingRank) != numberOfBlockDowngrade.end())
			iTotalOfDowngradeBH = numberOfBlockDowngrade.find(strActingRank)->second;
	}

	if (iTotalOfDowngrade == 0 && iTotalOfDowngradeBH == 0)
		return true;

	try
	{
		string::size_type position = strMaxBH.find(":");
		iMaxBh = stoi(strMaxBH.substr(0, position)) * 60 + stoi(strMaxBH.substr(position + 1));
	}
	catch (string e)
	{
		iMaxBh = 99999;
	}

	if (iTotalOfDowngrade > iMax || iTotalOfDowngradeBH > iMaxBh)
	{
		string temp = Utility::GetInstancePtr()->formatMinutes(iTotalOfDowngradeBH);
		string msg = "The number of cross-rank(" + Utility::GetInstancePtr()->ToString(iTotalOfDowngrade)+") instances or block hours on cross-rank(";
		msg += temp + ") exceeds the limitation(Times=" + strMax;
		msg += ",Block hours=" + strMaxBH + ",Active Rank=" + strActiveRank + ",Acting Rank=" + strActingRank + ") in this scenario.";
		pCrew->legalMessage.push_back(msg);
		this->setLegalityMessage(crew, pCrew, singleRule, msg);
		pCrew->isLegal = false;
		bReturn = false;
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = crews[pCrew->crewIndex]->idCrew;
		//rv->rosterId = (*roster)->rosterId;
		//rv->pairingId = (*roster)->pairId;
		//rv->dutySequenceNumber = (*duty)->getDutySegNum();
		//rv->segmentId = (*segment)->getDBId();
		rv->startDTUtc = lCheckedStart;
		rv->endDTUtc = lCheckedEnd;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		//OP#1448提供message参数给gantt
		rv->operation_result.insert(pair<string, string>("iTotalOfDowngrade", Utility::GetInstancePtr()->ToString(iTotalOfDowngrade)));
		rv->operation_result.insert(pair<string, string>("temp", temp));
		rv->operation_result.insert(pair<string, string>("strMax", strMax));
		rv->operation_result.insert(pair<string, string>("strMaxBH", strMaxBH));
		rv->operation_result.insert(pair<string, string>("strActiveRank", strActiveRank));
		rv->operation_result.insert(pair<string, string>("strActingRank", strActingRank));
		rv->violation_msg = msg;
		this->addRuleViolations(rv, singleRule);
	}

	return bReturn;
}

bool LegalityChecker::checkMaxDowngrade(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	//BASE,RANK,FLEET,PERIOD,UNIT,MAX CROSS RANK BH,MAX CROSS RANK TIMES
	string strBase, strRank, strFleet, strPeriod, strUnit, strMax, strMaxBH, strActingRanks = "*";
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASE")
			strBase = headeValue;
		if (header == "RANK")
			strRank = headeValue;
		if (header == "FLEET")
			strFleet = headeValue;

		if (header == "ACTING RANKS")
			strActingRanks = headeValue;
		if (header == "PERIOD")
			strPeriod = headeValue;
		if (header == "UNIT")
			strUnit = headeValue;
		if (header == "MAX CROSS RANK TIMES")
			strMax = headeValue;
		if (header == "MAX CROSS RANK BH")
			strMaxBH = headeValue;
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;
	string crewId = crew->idCrew;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<string> actingRanks;
	split(strActingRanks, '|', actingRanks);
//	boost::split(actingRanks, strActingRanks, boost::is_any_of(SPLIT_STRING), boost::token_compress_on);

	int iPeriod = stoi(strPeriod);
	int iMax = stoi(strMax);
	int iMaxBh = 0;

	try
	{
		string::size_type position = strMaxBH.find(":");
		iMaxBh = stoi(strMaxBH.substr(0, position)) * 60 + stoi(strMaxBH.substr(position + 1));
	}
	catch (string e)
	{
		iMaxBh = 99999;
	}

	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, lCheckedStart);
	int offsetMinutes = 0;
	if (base.empty())
		base = _dbData->scenario.bases[0];
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	map<time_t, time_t> mp;

	if (strUnit == "CM")
	{
		mp = Utility::GetInstancePtr()->getMonthRollingWindows(lCheckedStart, lCheckedEnd + 24 * 3600, offsetMinutes, iPeriod);
	}
	else if (strUnit == "CW")
	{
		mp = Utility::GetInstancePtr()->getWeeksRollingWindows(lCheckedStart - (iPeriod * 7 - 1) * 24 * 3600, lCheckedEnd + (iPeriod * 7 - 1) * 24 * 3600, weekdayStartFrom, offsetMinutes, iPeriod);
	}
	else if (strUnit == "CD")
	{
		mp = Utility::GetInstancePtr()->getDaysRollingWindows(lCheckedStart - (iPeriod - 1) * 24 * 3600, lCheckedEnd + (iPeriod - 1) * 24 * 3600, offsetMinutes, iPeriod);
	}
	else
		return true;

	string actingRank;

	for (map<time_t, time_t>::iterator single = mp.begin(); single != mp.end(); ++single)
	{
		int crossRank = 0, crossRankBH = 0;
		bool isROCrossRank = false;
		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
		{
			if (!(Utility::GetInstancePtr()->isTimeOverlap((*single).first, (*single).second, (*roster)->actStrUtc, (*roster)->actEndUtc)))
				continue;

			actingRank = (*roster)->actingRank;

			//0001950: [8051]目前的rank設定無法排除各级别down到acting rank=OVER的情況
			if (strActingRanks != "*" && std::find(actingRanks.begin(), actingRanks.end(), actingRank) == actingRanks.end())
				continue;

			bool isCross = false;

			for (vector<SharedPtr<CREW_RANK>>::iterator rank = ranks.begin(); rank != ranks.end(); ++rank)
			{
				if (((*rank)->effUtc > (*roster)->actStrUtc) || ((*rank)->rank == actingRank))
					continue;

				if ((*rank)->expUtc == NULL || (*rank)->expUtc < 0 || (*rank)->expUtc>(*roster)->actStrUtc)
					if (actingRank != (*rank)->rank)
					{
						//0001951: [8051]跨月pairing，次數應該只計入上月
						//0002002: 跨月逻辑更改成各算0.5
						if ((*roster)->actStrUtc >= (*single).first || (*roster)->actRestStrUtc <= (*single).second + 24 * 3600)
						{
							if ((*roster)->actStrUtc >= (*single).first && (*roster)->actRestStrUtc <= (*single).second + 24 * 3600)
								crossRank++;
							else
								crossRank = (int)(crossRank + 0.5); //TODO hexd ???
						}

						isCross = true;
					}
			}
			//0001961: [8051]预占任务违犯8051，不应阻挡后续非Cross任务的优化
			if (pCrew->RosterIndex >= 0 && rosters[pCrew->RosterIndex]->rosterId == (*roster)->rosterId && isCross)
				isROCrossRank = true;

			if ((*roster)->pairing && isCross)
			{
				vector<Duty*> duties = (*roster)->pairing->getDutyVec();
				for (vector<Duty*>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
				{
					vector<Segment*> segments = (*duty)->getSegments();
					for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
					{
						string assignment = (*segment)->getAssignment();
						auto segStart = (*segment)->getStartTimeUtcAct();
						auto segEnd = (*segment)->getEndTimeUtcAct();
						//intersect
						int iTemp = static_cast<int>(min((*single).second, segEnd) - max((*single).first, segStart));
						//iTemp = (*segment)->getBlkMinutes();
						double factor = 1;
						if (this->_dbData->assignmentNameMap.find(assignment) != _dbData->assignmentNameMap.end())
						{
							SharedPtr<ASSIGNMENT> assignment = _dbData->assignmentNameMap[(*segment)->getAssignment()];
							factor = assignment->BT_PCT;
						}
						if (iTemp > 0)
							crossRankBH += (int)round((iTemp*factor) / 60.0);

					}
				}
			}
		}

		if (crossRank > iMax || crossRankBH > iMaxBh)
		{
			//0001961: [8051]预占任务违犯8051，不应阻挡后续非Cross任务的优化
			if (this->_application == ROSTER_OPTIMIZER && !isROCrossRank)
				continue;

			string temp = Utility::GetInstancePtr()->formatMinutes(crossRankBH);

			string msg = "The number of cross rank (" + Utility::GetInstancePtr()->ToString(crossRank)+") or BH on cross Rank(";
			msg += temp + ") is more than limitation(Times=" + strMax;
			msg += ",BH=" + strMaxBH + ") in " + strPeriod + " " + strUnit + ".";
			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage(crew, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crew->idCrew;
			//rv->rosterId = (*roster)->rosterId;
			//rv->pairingId = (*roster)->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = (*single).first;
			rv->endDTUtc = (*single).second;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("crossRank", Utility::GetInstancePtr()->ToString(crossRank)));
			rv->operation_result.insert(pair<string, string>("temp", temp));
			rv->operation_result.insert(pair<string, string>("strMax", strMax));
			rv->operation_result.insert(pair<string, string>("strMaxBH", strMaxBH));
			rv->operation_result.insert(pair<string, string>("strPeriod", strPeriod));
			rv->operation_result.insert(pair<string, string>("strUnit", strUnit));
			rv->violation_msg = msg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}

		}
	}
	return bReturn;
}

/* 8076: check roster limitation on outstation
Rule Parameters: Base/Exclude assignment type outside of base/Exception
*/

bool LegalityChecker::checkRosterLimitationOnOutstation(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;

	string strExclude, strRank, strBase, strCrewFleet = "*", strTeam = "*", strException, strLocation = "*";
	bool isDirectional = true;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")
			strBase = headeValue;
		if (header == "RANKS")
			strRank = headeValue;
		if (header == "FLEETS")
			strCrewFleet = headeValue;
		if (header == "CREW TEAMS")
			strTeam = headeValue;
		if (header == "LOCATIONS")
			strLocation = headeValue;
		if (header == "EXCLUDE ASSIGNMENT GROUPS")
			strExclude = headeValue;
		if (header == "EXCEPTION QUALIFIERS")
			strException = headeValue;
	}

	vector<string> excludes, exceptions, locations;
	split(strExclude, '|', excludes);
	split(strException, '|', exceptions);
	split(strLocation, '|', locations);
	//boost::split(excludes, strExclude, boost::is_any_of(SPLIT_STRING), boost::token_compress_on);
	//boost::split(exceptions, strException, boost::is_any_of(SPLIT_STRING), boost::token_compress_on);
	//boost::split(locations, strLocation, boost::is_any_of(SPLIT_STRING), boost::token_compress_on);

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	string crewId = crew->idCrew;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strCrewFleet, strTeam, "*", lCheckedStart, lCheckedEnd))
		return true;
	if (pCrew->RosterIndex > (int)crew->rosterList.size()) {
		Logger::getRuleLogger()->error("ERROR: rule 8076 fail, invalid param rosterIndex={} not exist on crew={}", pCrew->RosterIndex, crew->idCrew);
		return false;
	}
	//roster loop begin/end
	vector<SharedPtr<ROSTER>>::iterator checkRosterBeg = crew->rosterList.begin();
	vector<SharedPtr<ROSTER>>::iterator checkRosterEnd = crew->rosterList.end();
	if (pCrew->RosterIndex != -1 && this->_application == ROSTER_OPTIMIZER) {
		checkRosterBeg = crew->rosterList.begin() + pCrew->RosterIndex;
		checkRosterEnd = checkRosterBeg + 1;
	}
	for (auto& it = checkRosterBeg; it != checkRosterEnd; it++) {

		SharedPtr<ROSTER> roster = (*it);
		if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, strTeam, roster->actStrUtc, roster->actEndUtc))
			continue;
		if (strLocation != "*" && std::find(locations.begin(), locations.end(), roster->location) == locations.end()){
			continue;
		}

		if (std::find(excludes.begin(), excludes.end(), roster->duty) != excludes.end() &&
			std::find(exceptions.begin(), exceptions.end(), roster->qualifier) == exceptions.end())
		{
			string msg = "The current roster is not allowed at {0:strLocation} with parameters (Not Allowed Assignment Groups={1:strExclude}, Exception Qualifier={2:strException}).";
			msg = StringUtils::Format(msg, strLocation, strExclude, strException);

			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage(roster, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crew->idCrew;
			rv->rosterId = roster->rosterId;
			//rv->pairingId = (*roster)->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = roster->actStrUtc;
			rv->endDTUtc = roster->actEndUtc;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("strLocation", strLocation));
			rv->operation_result.insert(pair<string, string>("strExclude", strExclude));
			rv->operation_result.insert(pair<string, string>("strException", strException));
			rv->violation_msg = msg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
	}
	return true;
}

/*8085 number of role check*/
bool LegalityChecker::checkNumberOfRoles(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	if (pCrew->crewIndex < 0)
		return false;
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() < 1)
		return true;

	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlts = this->getDataContext()->crewOnFlt;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string pBases, pRanks, pFleets, pRoles, pMin, pMax, pFltFleets = "*", pLabels = "*";
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			pBases = headeValue;
		}
		if (header == "RANKS") {
			pRanks = headeValue;
		}
		if (header == "FLEETS") {
			pFleets = headeValue;
		}
		if (header == "FLIGHT FLEETS") {
			pFltFleets = headeValue;
		}
		if (header == "LABELS") {
			pLabels = headeValue;
		}
		if (header == "ROLES") {
			pRoles = headeValue;
		}
		if (header == "MIN") {
			pMin = headeValue;
		}
		if (header == "MAX") {
			pMax = headeValue;
		}
	}

	int iMin = stoi(pMin);
	int iMax = stoi(pMax);
	vector<string> roles, labels, flightFleets;
	split(pRoles, '|', roles);
	split(pLabels, '|', labels);
	split(pFltFleets, '|', flightFleets);
	//boost::split(roles, pRoles, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(labels, pLabels, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(flightFleets, pFltFleets, boost::is_any_of("|"), boost::token_compress_on);

	for (auto& roster : rosters)
	{
		if (this->_application == ROSTER_OPTIMIZER && !(roster->needRuleCheck))
			continue;
		if (!(roster->pairing))
			continue;
		string label = roster->pairing->getLabel();
		if (pLabels != "*")
		{
			//if (std::find(labels.begin(), labels.end(), label) == labels.end())
			//	continue;
			if (!Utility::GetInstancePtr()->likeFind(labels, label))
				continue;
		}
		const vector<Duty *>& duties = roster->pairing->getDutyVec();
		for (auto& duty : duties)
		{
			const vector<Segment*>& segments = duty->getSegments();
			for (auto& segment : segments)
			{
				long long flitId = segment->getDBId();

				if (pFltFleets != "*")
				{
					string fltFleet = segment->getFleetCD();
					if (std::find(flightFleets.begin(), flightFleets.end(), fltFleet) == flightFleets.end())
						continue;
				}
				int iRoles = 0;
				if (crewsOnFlts.find(flitId) != crewsOnFlts.end())
				{
					vector<SharedPtr<CrewOnFlight>>& cofs = crewsOnFlts.find(flitId)->second;
					for (auto& cof : cofs)
					{
						if (crew->division != cof->crew->division)
							continue;
						if (std::find(roles.begin(), roles.end(), cof->role) != roles.end())
							iRoles++;
					}
					if ((this->_application != ROSTER_OPTIMIZER && iRoles < iMin) || (iRoles > iMax))
					{
						char strBuf[100] = { 0 };
						utcToUtcStr(segment->getStartTimeLocSch(), strBuf, sizeof(strBuf));

						string msg = "The number of roles ({0:pRoles}) on flight ({1:flightNumber}/{2:flightStartTimeLocSch}), role count={3:iRoles} must be at least {4:pMin} and no more than {5:pMax}, Label={6:pLabels}, Fleet={7:pFltFleets}.";
						msg = StringUtils::Format(msg, pRoles, segment->getSegNumber(), string(strBuf).substr(0, 10), iRoles, pMin, pMax, pLabels, pFltFleets);

						pCrew->legalMessage.push_back(msg);
						this->setLegalityMessage(segment, singleRule, msg);
						pCrew->isLegal = false;
						bReturn = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crew->idCrew;
						rv->rosterId = roster->rosterId;
						rv->pairingId = roster->pairId;
						rv->dutySequenceNumber = duty->getDutySegNum();
						rv->segmentId = segment->getDBId();
						rv->startDTUtc = segment->getStartTimeUtcAct();
						rv->endDTUtc = segment->getEndTimeUtcAct();
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("pRoles", pRoles));
						rv->operation_result.insert(pair<string, string>("SegNumber", segment->getSegNumber()));
						rv->operation_result.insert(pair<string, string>("iRoles", Utility::GetInstancePtr()->iToa(iRoles)));
						rv->operation_result.insert(pair<string, string>("pMin", pMin));
						rv->operation_result.insert(pair<string, string>("pMax", pMax));
						rv->operation_result.insert(pair<string, string>("pLabels", pLabels));
						rv->operation_result.insert(pair<string, string>("pFltFleet", segment->getFleetCD()));
						rv->violation_msg = msg;
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER){
							return false;
						}

					}
				}
			}
		}
	}

	return bReturn;
}

/*
8075: Same rule parameters with 8042, and the rule logic is different
*/

bool LegalityChecker::checkEVAMaxExpatCrewOnFlight(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	rule8075 * cache = (rule8075*)singleRule->parsedParam.get();
	string& strBase = cache->strBase;
	string& strRank = cache->strRank;
	string& strCrewFleet = cache->strCrewFleet;
	string& strFleet = cache->strFleet;
	string& strActingRanks = cache->strActingRanks;
	string& strNationality = cache->strNationality;
	string& strDeparture = cache->strDeparture;
	string& strArrival = cache->strArrival;
	string& strNumbers = cache->strNumbers;
	string& strMax = cache->strMax;
	string& strMin = cache->strMin;
	string& strSegAssignGrps = cache->strSegAssignGrps;
	bool isDirectional = cache->isDirectional;
	vector<string>& nationalities = cache->nationalities;
	vector<string>& actingRanks = cache->actingRanks;
	vector<string>& arrStations = cache->arrStations;
	vector<string>& depStations = cache->depStations;
	vector<string>& fltNumbers = cache->fltNumbers;
	vector<string>& segAssignGrps = cache->segAssignGrps;
	vector<string>& flightFleets = cache->fltFleets;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	string crewId = crew->idCrew;
	string nationality = crew->nationality;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strCrewFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	// mantis#4776, 8075法規Crew Nationalities不再允許*
	if (std::find(nationalities.begin(), nationalities.end(), nationality) == nationalities.end())
		return true;

	int iMax = stoi(strMax);
	int iMin = stoi(strMin);
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;
	long long flt_id;
	string depCode, arrCode, fltFleet, actingRank, nat;
	stringstream natMsg;
	for (auto& roster : rosters)
	{
		actingRank = roster->actingRank;
		if (this->_application == ROSTER_OPTIMIZER && !(roster->needRuleCheck))
			continue;
		if (actingRank != strRank && strRank != "*")
			continue;

		if (roster->pairing)
		{
			//vector<Duty *>& duties = roster->pairing->getDutyVec();
			for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
			{
				Duty* duty = roster->pairing->getDuty(di);
				Duty::DUTY_TYPE dt = duty->getType();
				if (dt != Duty::DUTY_FLY && dt != Duty::DUTY_PURE_OPR)
					continue;
				//vector<Segment*>& segments = duty->getSegments();
				for (std::size_t si = 0; si < duty->getNumSegments(); si++)
				{
					Segment* segment = duty->getSegment(si);

					if (!segment->getIsOperating())
						continue;
					depCode = segment->getDepStation();
					arrCode = segment->getArrStation();
					fltFleet = segment->getFleetCD();

					//if (strFleet != "*" && strFleet != fltFleet)
					//0002596: 8042、8075 Flight Fleet開放多選
					if (strFleet != "*" && find(flightFleets.begin(), flightFleets.end(), fltFleet) == flightFleets.end())
						continue;

					if (strNumbers != "*" && find(fltNumbers.begin(), fltNumbers.end(), segment->getSegNumber()) == fltNumbers.end())
						continue;

					if (
						(isDirectional && ((strDeparture == "*" || find(depStations.begin(), depStations.end(), depCode) != depStations.end()) &&
						(strArrival == "*" || find(arrStations.begin(), arrStations.end(), arrCode) != arrStations.end()))) ||
						(!isDirectional && (((strDeparture == "*" || find(depStations.begin(), depStations.end(), depCode) != depStations.end()) &&
						(strArrival == "*" || find(arrStations.begin(), arrStations.end(), arrCode) != arrStations.end())) ||
						((strDeparture == "*" || find(depStations.begin(), depStations.end(), arrCode) != depStations.end()) &&
						(strArrival == "*" || find(arrStations.begin(), arrStations.end(), depCode) != arrStations.end())))) ||
						//(strSegAssignGrps == "*" || find(segAssignGrps.begin(), segAssignGrps.end(), segment->getAssignment()) != segAssignGrps.end()) || //mantis#2413, 增加 assignGrps筛选
						(strDeparture == "*" && strArrival == "*")
						)
					{
						flt_id = segment->getDBId();
						if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
						{
							vector<SharedPtr<CrewOnFlight>>& cofs = crewsOnFlt.find(flt_id)->second;
							int iNumberOfExpat = 0;
							vector<string> countNationlities;
							natMsg.str("");// = "";
							for (auto& cof : cofs)
							{
								if (crew->division != cof->crew->division)
									continue;

								//mantis#2413, 按segment assignment筛选 cof
								if ((strSegAssignGrps != "*" && find(segAssignGrps.begin(), segAssignGrps.end(), cof->assignment) == segAssignGrps.end())) {
									continue;
								}

								nat = cof->crew->nationality;
								if (std::find(nationalities.begin(), nationalities.end(), nat) != nationalities.end())
								{
									iNumberOfExpat++;
								}
							}
							//iMax
							int i = iNumberOfExpat;
							//if ((strNationality == "*" && nationlities.size() > iMax) ||
							//	(strNationality != "*" && iNumberOfExpat > iMax))
							if (i > iMax || (i < iMin && this->_application != ROSTER_OPTIMIZER))
							{
								char strBuf[100] = { 0 };
								utcToUtcStr(segment->getStartTimeLocSch(), strBuf, sizeof(strBuf));
								//string flightNum = segment->getAirlineCode() + segment->getSegNumber() + "/" + string(strBuf).substr(0, 10);
								natMsg.str(strNationality);

								string msg = "The number of expatriate crew ({0:iNumberOfExpat}) on flight ({1:flightNumber}/{2:flightStartTimeLocSch}) between " \
									"airports ({3:strDeparture}-{4:strArrival}) with nationality ({5:strNationality}) exceeds the maximum limitation ({6:strMax}) or is less than the minimum limitation ({7:strMin}).";
								msg = StringUtils::Format(msg, i, segment->getSegNumber(), string(strBuf).substr(0, 10), strDeparture, strArrival, natMsg.str(), strMax, strMin);

								pCrew->legalMessage.push_back(msg);
								this->setLegalityMessage(segment, singleRule, msg);
								pCrew->isLegal = false;
								bReturn = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = crew->idCrew;
								rv->rosterId = roster->rosterId;
								rv->pairingId = roster->pairId;
								rv->dutySequenceNumber = duty->getDutySegNum();
								rv->segmentId = segment->getDBId();
								rv->startDTUtc = segment->getStartTimeUtcAct();
								rv->endDTUtc = segment->getEndTimeUtcAct();
								rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("iMax", Utility::GetInstancePtr()->ToString(i)));
								rv->operation_result.insert(pair<string, string>("SegNumber", segment->getSegNumber()));
								rv->operation_result.insert(pair<string, string>("strBuf", string(strBuf).substr(0, 10)));
								rv->operation_result.insert(pair<string, string>("strDeparture", strDeparture));
								rv->operation_result.insert(pair<string, string>("strArrival", strArrival));
								rv->operation_result.insert(pair<string, string>("natMsg", natMsg.str()));
								rv->operation_result.insert(pair<string, string>("strMax", strMax));
								rv->operation_result.insert(pair<string, string>("strMin", strMin));
								rv->violation_msg = msg;
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER){
									return false;
								}
							}
						}
					}
				}
			}

		}
	}

	return bReturn;
}

//8042
bool LegalityChecker::checkMaxExpatCrewOnFlight(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	rule8042 * cache = (rule8042*)singleRule->parsedParam.get();
	string& strBase = cache->strBase;
	string& strRank = cache->strRank;
	string& strCrewFleet = cache->strCrewFleet;
	string& strFleet = cache->strFleet;
	string& strActingRanks = cache->strActingRanks;
	string& strNationality = cache->strNationality;
	string& strDeparture = cache->strDeparture;
	string& strArrival = cache->strArrival;
	string& strNumbers = cache->strNumbers;
	string& strMax = cache->strMax;
	string& strMin = cache->strMin;
	string& strSegAssignGrps = cache->strSegAssignGrps;
	string& strDestinationCountries = cache->strDestinationCountries;
	bool isDirectional = cache->isDirectional;
	vector<string>& nationalities = cache->nationalities;
	vector<string>& actingRanks = cache->actingRanks;
	vector<string>& arrStations = cache->arrStations;
	vector<string>& depStations = cache->depStations;
	vector<string>& fltNumbers = cache->fltNumbers;
	vector<string>& segAssignGrps = cache->segAssignGrps;
	vector<string>& flightFleets = cache->fltFleets;
	vector<string>& exceptionNationalities = cache->exceptNationalities;
	vector<string>& destinationCountries = cache->destinationCountries;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	string crewId = crew->idCrew;
	string nationality = crew->nationality;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strCrewFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	int iMax = stoi(strMax);
	int iMin = stoi(strMin);

	// mantis#5415, 檢查外籍組員Max人數時, 只需要檢查該國籍組員
	if ((this->_application == ROSTER_OPTIMIZER || iMin == 0) && strNationality != "*" &&
		((nationalities.size() > 0 && std::find(nationalities.begin(), nationalities.end(), nationality) == nationalities.end())) || (exceptionNationalities.size() > 0 && std::find(exceptionNationalities.begin(), exceptionNationalities.end(), nationality) != exceptionNationalities.end()))
		return true;

	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;
	long long flt_id = 0;
	string depCode, arrCode, fltFleet, actingRank, nat;
	stringstream natMsg;
	//for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	for (auto& roster : rosters)
	{
		actingRank = roster->actingRank;
		if (this->_application == ROSTER_OPTIMIZER && !(roster->needRuleCheck))
			continue;

		if (actingRank != strRank && strRank != "*")
			continue;

		//if (roster->pairing->getDbId() == 16704137)
		//	printf("debug1");
		if (roster->pairing)
		{
			for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
			{
				Duty * duty = roster->pairing->getDuty(di);
				Duty::DUTY_TYPE dt = duty->getType();
				if (dt != Duty::DUTY_FLY && dt != Duty::DUTY_PURE_OPR)
					continue;
				for (std::size_t si = 0; si < duty->getNumSegments(); si++)
				{
					Segment * segment = duty->getSegment(si);
					if (!segment->getIsOperating())
						continue;
					depCode = segment->getDepStation();
					arrCode = segment->getArrStation();
					fltFleet = segment->getFleetCD();

					//flightFleets
					//0002596: 8042、8075 Flight Fleet開放多選
					//if (strFleet != "*" && strFleet != fltFleet)
					if (strFleet != "*" && find(flightFleets.begin(), flightFleets.end(), fltFleet) == flightFleets.end())
						continue;

					if (strNumbers != "*" && find(fltNumbers.begin(), fltNumbers.end(), segment->getSegNumber()) == fltNumbers.end())
						continue;

					if (strDestinationCountries != "*" && find(destinationCountries.begin(), destinationCountries.end(), arrCode) == destinationCountries.end())
						continue;

					//if (
					//	(isDirectional && ((strDeparture == "*" || strDeparture == depCode) && (strArrival == "*" || strArrival == arrCode))) ||
					//	(!isDirectional && (((strDeparture == "*" || strDeparture == depCode) && (strArrival == "*" || strArrival == arrCode))
					//	|| ((strDeparture == "*" || strDeparture == arrCode) && (strArrival == "*" || strArrival == depCode))))
					//	|| (strDeparture == "*" && strArrival == "*")
					//	)
					if (
						(isDirectional && ((strDeparture == "*" || find(depStations.begin(), depStations.end(), depCode) != depStations.end()) &&
						(strArrival == "*" || find(arrStations.begin(), arrStations.end(), arrCode) != arrStations.end()))) ||
						(!isDirectional && (((strDeparture == "*" || find(depStations.begin(), depStations.end(), depCode) != depStations.end()) &&
						(strArrival == "*" || find(arrStations.begin(), arrStations.end(), arrCode) != arrStations.end())) ||
						((strDeparture == "*" || find(depStations.begin(), depStations.end(), arrCode) != depStations.end()) &&
						(strArrival == "*" || find(arrStations.begin(), arrStations.end(), depCode) != arrStations.end())))) ||
						(strDeparture == "*" && strArrival == "*")
						)
					{
						flt_id = segment->getDBId();
						if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
						{
							vector<SharedPtr<CrewOnFlight>>& cofs = crewsOnFlt.find(flt_id)->second;
							int iNumberOfExpat = 0;
							vector<string> countNationlities;
							natMsg.str("");//clear
							for (auto& cof : cofs)
							{
								if (crew->division != cof->crew->division)
									continue;

								if (strActingRanks != "*" && std::find(actingRanks.begin(), actingRanks.end(), cof->actingRank) == actingRanks.end())
									continue;

								//mantis#2413, 按segment assignment筛选 cof
								if ((strSegAssignGrps != "*" && find(segAssignGrps.begin(), segAssignGrps.end(), cof->assignment) == segAssignGrps.end())) {
									continue;
								}

								nat = cof->crew->nationality;
								if (strNationality == "*")
								{
									if ((strRank == "*" || cof->actingRank == strRank) && (find(countNationlities.begin(), countNationlities.end(), nat) == countNationlities.end()))
									{
										countNationlities.push_back(nat);
										if (countNationlities.size() == 1)
											natMsg << nat;
										else
											natMsg << "|" << nat;
									}
								}
								//(std::find(nationalities.begin(), nationalities.end(), nationality) != nationalities.end())
								//else if (strNationality==nat)
								else if ((strRank == "*" || cof->actingRank == strRank) && (std::find(nationalities.begin(), nationalities.end(), nat) != nationalities.end() || (exceptionNationalities.size() > 0 && std::find(exceptionNationalities.begin(), exceptionNationalities.end(), nat) == exceptionNationalities.end())))
								{
									iNumberOfExpat++;
								}
							}
							//iMax
							int i = 0;
							if (strNationality == "*")
								i = (int)countNationlities.size();
							if (strNationality != "*")
								i = iNumberOfExpat;
							//if ((strNationality == "*" && nationlities.size() > iMax) ||
							//	(strNationality != "*" && iNumberOfExpat > iMax))
							if (i > iMax || (i < iMin && this->_application != ROSTER_OPTIMIZER))
							{
								stringstream ss;
								char strBuf[100] = { 0 };
								utcToUtcStr(segment->getStartTimeLocSch(), strBuf, sizeof(strBuf));
								if (strNationality != "*")
								{
									natMsg.str(strNationality);
									ss << "The number of expatriate crew(";
								}
								else
								{
									ss << "The number of crew nationalities(";
								}

								ss << i << ") on flight("  << segment->getSegNumber() << "/" << string(strBuf).substr(0, 10) << ")"; //flightNum
								ss << " between airports (" << strDeparture << "-" << strArrival << ")";
								ss << " with nationality (" << natMsg.str() << ")";
								ss << " exceeds the maximum limitation (" << strMax << ") or is less than the minimum limitation(" << strMin << ").";
								string msg = ss.str();
								pCrew->legalMessage.push_back(msg);
								this->setLegalityMessage(segment, singleRule, msg);
								pCrew->isLegal = false;
								bReturn = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = crew->idCrew;
								rv->rosterId = roster->rosterId;
								rv->pairingId = roster->pairId;
								rv->dutySequenceNumber = duty->getDutySegNum();
								rv->segmentId = segment->getDBId();
								rv->startDTUtc = segment->getStartTimeUtcAct();
								rv->endDTUtc = segment->getEndTimeUtcAct();
								rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("iMax", Utility::GetInstancePtr()->ToString(i)));
								rv->operation_result.insert(pair<string, string>("SegNumber", segment->getSegNumber()));
								rv->operation_result.insert(pair<string, string>("strBuf", string(strBuf).substr(0, 10)));
								rv->operation_result.insert(pair<string, string>("strDeparture", strDeparture));
								rv->operation_result.insert(pair<string, string>("strArrival", strArrival));
								rv->operation_result.insert(pair<string, string>("nationality", natMsg.str()));
								rv->operation_result.insert(pair<string, string>("strMax", strMax));
								rv->operation_result.insert(pair<string, string>("strMin", strMin));
								rv->violation_msg = msg;
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER){
									return false;
								}
							}
						}
					}
				}
			}

		}
	}

	return bReturn;
}


//8077
bool LegalityChecker::checkMaxCrewOnPairing(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	rule8077 * cache = (rule8077*)singleRule->parsedParam.get();
	string& strBase = cache->strBases;
	string& strRank = cache->strRanks;
	string& strFleet = cache->strFleets;
	string& strNationality = cache->strNationalities;
	string& strMax = cache->strMax;
	string& strLabel = cache->strLabels;
	string& strAttribute = cache->strAttributes;
	string& strDuty = cache->strDuty;
	string& strActingRanks = cache->strActingRanks;
	vector<string>& nationalities = cache->nationalities;
	vector<string>& labels = cache->labels;
	vector<string>& attributes = cache->attributes;
	vector<string>& actingRanks = cache->actingRanks;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	string crewId = crew->idCrew;
	string nationality = crew->nationality;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}

	if (this->_application == ROSTER_OPTIMIZER && strNationality != "*" && (std::find(nationalities.begin(), nationalities.end(), nationality) == nationalities.end()))
		return true;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	int iMax = stoi(strMax);

	map<long long, list<SharedPtr<CrewOnFlight>>>& crewsOnPg = this->getDataContext()->crewOnPairing;
	long long pairingId = 0;
	string nat, actingRank;
	stringstream natMsg;
	for (auto& roster : rosters)
	{
		if (this->_application == ROSTER_OPTIMIZER && !(roster->needRuleCheck))
			continue;
		if (strDuty != "*" && roster->duty != strDuty)
			continue;
		//if (roster->pairing->getDbId() == 16704137)
		//	printf("debug1");
		if (roster->pairing)
		{
			string label = roster->label;
			string attribute = roster->pairing->getAttribute();

			if (strLabel != "*" && std::find(labels.begin(), labels.end(), label) == labels.end())
				continue;
			if (strAttribute != "*" && std::find(attributes.begin(), attributes.end(), attribute) == attributes.end())
				continue;
			int iCount = 0;
			if (crewsOnPg.find(roster->pairId) != crewsOnPg.end())
			{
				list<SharedPtr<CrewOnFlight>>& cofs = crewsOnPg.find(roster->pairId)->second;
				for (auto& cof : cofs)
				{
					nat = cof->crew->nationality;
					actingRank = cof->actingRank;
					if (strNationality == "*" || std::find(nationalities.begin(), nationalities.end(), nat) != nationalities.end())
						if (strActingRanks == "*" || std::find(actingRanks.begin(), actingRanks.end(), actingRank) != actingRanks.end())
							iCount++;
				}

				if (iCount > iMax)
				{
					string msg = "The number of crew ({0:iCount}) with nationality ({1:strNationality}) on the pairing exceeds the maximum limitation ({2:iMax}).";
					msg = StringUtils::Format(msg, iCount, strNationality, iMax);

					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(roster->pairing, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = crew->idCrew;
					rv->rosterId = roster->rosterId;
					rv->pairingId = roster->pairId;
					rv->startDTUtc = roster->actStrUtc;
					rv->endDTUtc = roster->actEndUtc;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("iCount", Utility::GetInstancePtr()->iToa(iCount)));
					rv->operation_result.insert(pair<string, string>("strNationality", strNationality));
					rv->operation_result.insert(pair<string, string>("iMax", Utility::GetInstancePtr()->iToa(iMax)));
					rv->violation_msg = msg;
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}

			}

		}
	}

	return bReturn;
}



//bool LegalityChecker::checkCustomizedRules(RULE_LEGALITY * pCrew, const DBRule* singleRule)
//{
//	bool bReturn = true;
//
//	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
//
//	std::vector<CUSTOM_VIOLATION*> vios = custRules->Custom_Rules_Check(crew, singleRule);
//
//	for (std::vector<CUSTOM_VIOLATION*>::iterator vio = vios.begin(); vio != vios.end(); vio++)
//	{
//		if (!(*vio)->isLegal)
//		{
//			string ruleid = Utility::GetInstancePtr()->ToString(singleRule->idRule);
//			string message = "[EVA]" + (*vio)->legalMessage;
//
//			this->setLegalityMessage(crew, pCrew, singleRule, message);
//			pCrew->isLegal = false;
//			bReturn = false;
//			RULE_VIOLATION* rv = new RULE_VIOLATION();
//			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
//
//			rv->startDTUtc = (*vio)->startUtc;
//			rv->endDTUtc = (*vio)->endUtc;
//
//			rv->rosterId = (*vio)->rosterId;
//			rv->pairingId = (*vio)->pairingId;
//			rv->segmentId = (*vio)->segmentId;
//			rv->type = (*vio)->type;
//
//			rv->violation_msg = message;
//			rv->msg_type = (*vio)->msg_type;
//			rv->operation_result = (*vio)->operation_result;
//			this->addRuleViolations(rv, singleRule);
//		}
//	}
//	std::for_each(vios.begin(), vios.end(), std::default_delete<CUSTOM_VIOLATION>());
//
//	return bReturn;
//
//}


bool LegalityChecker::checkGeneralDOReq(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;

	string strLables = "*", strAttributes = "*", strRosterTypes = "*", strDOGroups = "*", strMinDOBefore = "0", strMinDOAfter = "0", strEarly = "*", strLate = "*", strRequested = "*";
	bool bCountPostRest = false, bBlankDay = false;
	//DUTY START LOC,DUTY END LOC,DO ASSIGNMENT GROUP,MIN DO,UTILIZE POST DUTY REST,COUNT BLANK DAY
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "LABELS")
			strLables = headeValue;
		if (header == "ATTRIBUTES")
			strAttributes = headeValue;
		if (header == "ROSTR DUTY TYPES")
			strRosterTypes = headeValue;
		if (header == "REPORT EARLY THAN")
			strEarly = headeValue;
		if (header == "EOD LATE THAN")
			strLate = headeValue;
		if (header == "DO ASSIGNMENT GROUPS")
			strDOGroups = headeValue;
		if (header == "MIN DO BEFORE ROSTER")
			strMinDOBefore = headeValue;
		if (header == "MIN DO AFTER ROSTER")
			strMinDOAfter = headeValue;
		if (header == "UTILIZE POST DUTY REST")
			bCountPostRest = (headeValue == "Y");
		if (header == "COUNT BLANK DAY")
			bBlankDay = (headeValue == "Y");
		//0001923: 8068-希望新增IS REQUESTED欄位
		if (header == "IS REQUESTED")
			strRequested = headeValue;
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return true;
	if (strDOGroups == "*")
	{
		printf("8068: Days off assignment group paramter must be set.\n");
		return true;
	}
	vector<string> rosterTypes, labels, attributes, dayOffGroups;
	split(strRosterTypes, '|', rosterTypes);
	split(strLables, '|', labels);
	split(strAttributes, '|', attributes);
	split(strDOGroups, '|', dayOffGroups);
	//boost::split(rosterTypes, strRosterTypes, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(labels, strLables, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(attributes, strAttributes, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(dayOffGroups, strDOGroups, boost::is_any_of("|"), boost::token_compress_on);

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> daysOffs, restAssignments;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if (this->_dbData->version == 3 || (*assignment)->airline == airlinecode)
		{
			if (find(dayOffGroups.begin(), dayOffGroups.end(), (*assignment)->assignemnt) != dayOffGroups.end())
				daysOffs.push_back((*assignment)->assignemnt);
		}
	}
	int iRequiredDOBefore = stoi(strMinDOBefore);
	int iRequiredDOAfter = stoi(strMinDOAfter);

	time_t lStartUtc = 0;
	bool isInRange = false;
	int iOffsetMinutes = 0;
	int iDaysOff = 0;
	string strDepStation;
	time_t start, end;

	if (strEarly == "*")
		strEarly = "24:00";
	if (strLate == "*")
		strLate = "00:00";

	string fltAttr;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		//if (!((*roster)->needRuleCheck) && this->_application == ROSTER_OPTIMIZER && (*roster)->source == "PA")
		//	continue;

		if (strRosterTypes != "*" && std::find(rosterTypes.begin(), rosterTypes.end(), (*roster)->duty) == rosterTypes.end())
			continue;

		//if (strLables != "*" && std::find(labels.begin(), labels.end(), (*roster)->label) == labels.end())
		//	continue;
		if (strLables != "*")
			if (!Utility::GetInstancePtr()->likeFind(labels, (*roster)->label))
				continue;

		if (strRequested == "Y" && !(*roster)->isRequested)
			continue;
		if (strRequested == "N" && (*roster)->isRequested)
			continue;

		if (!((*roster)->pairing))
			continue;

		if (strAttributes != "*")
		{
			fltAttr = (*roster)->pairing->getAttribute();
			//Does fltAttr contains one of strAttributes
			bool bHas = false;

			for (vector<string>::iterator oneAtt = attributes.begin(); oneAtt != attributes.end(); ++oneAtt)
			{
				if (fltAttr.find((*oneAtt)) != std::string::npos)
				{
					bHas = true;
					break;
				}
			}
			if (!bHas)
				continue;
		}

		lStartUtc = (*roster)->pairing->getStartTimeUtc();
		strDepStation = (*roster)->location;
		iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(strDepStation);
		isInRange = Utility::GetInstancePtr()->IsTimesInRange(lStartUtc, iOffsetMinutes, "00:00", strEarly);
		if (isInRange && iRequiredDOBefore > 0)
		{
			start = Utility::GetInstancePtr()->getLocalDayStartInUTC(lStartUtc, iOffsetMinutes) - iRequiredDOBefore * 24 * 3600;
			end = lStartUtc;

			if (!bCountPostRest)
				iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end);
			else
				iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, iOffsetMinutes, bBlankDay, bCountPostRest, this->_dbData->airportCodeMap, "", 1);

			if (iDaysOff < iRequiredDOBefore)
			{
				if (this->_application == ROSTER_OPTIMIZER && (*roster)->source != "CR" && !((*roster)->needRuleCheck))
					if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, start, end)))
						continue;
				string msg = "The number of days off(" + Utility::GetInstancePtr()->ToString(iDaysOff)+") must be at least " + strMinDOBefore;
				msg += " before roster[" + Utility::GetInstancePtr()->ToString((*roster)->rosterId) + "].";
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				//rv->rosterId = (*roster)->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = start;
				rv->endDTUtc = end;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
				rv->operation_result.insert(pair<string, string>("strMinDO", strMinDOBefore));
				rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString((*roster)->rosterId)));
				rv->operation_result.insert(pair<string, string>("label", (*roster)->label));
				rv->operation_result.insert(pair<string, string>("status", "before"));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}
		}

		lStartUtc = (*roster)->actRestStrUtc;
		isInRange = Utility::GetInstancePtr()->IsTimesInRange(lStartUtc, iOffsetMinutes, strLate, "24:00");
		if (isInRange && iRequiredDOAfter > 0)
		{
			start = lStartUtc;
			end = Utility::GetInstancePtr()->getLocalDayStartInUTC(lStartUtc, iOffsetMinutes) + (iRequiredDOAfter + 1) * 24 * 3600;

			if (!bCountPostRest)
				iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end);
			else
				iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, iOffsetMinutes, bBlankDay, bCountPostRest, this->_dbData->airportCodeMap, "", 1);

			if (iDaysOff < iRequiredDOAfter)
			{
				if (this->_application == ROSTER_OPTIMIZER && (*roster)->source != "CR" && !((*roster)->needRuleCheck))
					if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, start, end)))
						continue;
				string msg = "The number of days off(" + Utility::GetInstancePtr()->ToString(iDaysOff)+") must be at least " + strMinDOAfter;
				msg += " after roster[" + Utility::GetInstancePtr()->ToString((*roster)->rosterId) + "].";
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				//rv->rosterId = (*roster)->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = start;
				rv->endDTUtc = end;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
				rv->operation_result.insert(pair<string, string>("strMinDO", strMinDOAfter));
				rv->operation_result.insert(pair<string, string>("label", (*roster)->label));
				rv->operation_result.insert(pair<string, string>("status", "after"));
				rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString((*roster)->rosterId)));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}
		}

	}

	return bReturn;
}


bool LegalityChecker::checkMinDOBeforeEarlyDuty(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;

	string rosterStart, rosterEnd, strDOGroup, strMinDO, strRosterDuties;
	bool bCountPostRest = false, bBlankDay = false;
	//DUTY START LOC,DUTY END LOC,DO ASSIGNMENT GROUP,MIN DO,UTILIZE POST DUTY REST,COUNT BLANK DAY
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "ROSTER START LOC")
			rosterStart = headeValue;
		if (header == "ROSTER END LOC")
			rosterEnd = headeValue;
		if (header == "DO ASSIGNMENT GROUP")
			strDOGroup = headeValue;
		if (header == "MIN DO")
			strMinDO = headeValue;
		if (header == "ROSTER DUTY")
			strRosterDuties = headeValue;

		if (header == "UTILIZE POST DUTY REST")
			bCountPostRest = (headeValue == "Y");
		if (header == "COUNT BLANK DAY")
			bBlankDay = (headeValue == "Y");
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return true;

	vector<string> vCheckedRoster;
	split(strRosterDuties, '|', vCheckedRoster);
//	boost::split(vCheckedRoster, strRosterDuties, boost::is_any_of("|"), boost::token_compress_on);


	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> daysOffs, restAssignments;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->assignmentGroup == strDOGroup && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
		{
			daysOffs.push_back((*assignment)->assignemnt);
		}
		if ((*assignment)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
			restAssignments.push_back((*assignment)->assignemnt);
	}
	int iRequiredDO = stoi(strMinDO);

	time_t lStartUtc = 0;
	bool isInRange = false;
	int	 iOffsetMinutes = 0;
	int iDaysOff = 0;
	string strDepStation;
	time_t start, end;
	//bool isInRange = Utility::GetInstancePtr()->IsTimesInRange(checkin, offset, dutyStart, dutyEnd);
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		if (!((*roster)->needRuleCheck) && this->_application == ROSTER_OPTIMIZER && (*roster)->source != "CR")
			continue;

		//if ((*roster)->duty != "FLY" && (*roster)->duty != "RB")
		//	continue;

		if (std::find(vCheckedRoster.begin(), vCheckedRoster.end(), (*roster)->duty) == vCheckedRoster.end())
			continue;

		lStartUtc = (*roster)->actStrUtc;
		strDepStation = (*roster)->location;
		iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(strDepStation);
		isInRange = Utility::GetInstancePtr()->IsTimesInRange(lStartUtc, iOffsetMinutes, rosterStart, rosterEnd);
		if (isInRange)
		{
			start = Utility::GetInstancePtr()->getLocalDayStartInUTC(lStartUtc, iOffsetMinutes) - iRequiredDO * 24 * 3600;
			end = lStartUtc;

			if (!bCountPostRest)
				iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end);
			else
				iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, iOffsetMinutes, bBlankDay, bCountPostRest, this->_dbData->airportCodeMap, "", 1);

			if (iDaysOff < iRequiredDO)
			{
				string msg = "The number of days off(" + Utility::GetInstancePtr()->ToString(iDaysOff)+") must be at least " + strMinDO;
				msg += " before the early " + (*roster)->duty + " roster[" + Utility::GetInstancePtr()->ToString((*roster)->rosterId) + "].";
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				//rv->rosterId = (*roster)->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = start;
				rv->endDTUtc = end;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
				rv->operation_result.insert(pair<string, string>("strMinDO", strMinDO));
				rv->operation_result.insert(pair<string, string>("duty", (*roster)->duty));
				rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString((*roster)->rosterId)));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}
		}

	}

	return bReturn;
}

bool LegalityChecker::checkMinDOPerAL(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;

	string strBase, strRank, strFleet, strALAssmGrp, strAL, strDOAssGrp, strMinDO, strPeriod, strUnit;
	bool bCountPostRest = false, bBlankDay = false;

	//BASE,RANK,FLEET,AL ASSIGNMENT GROUP,# AL,DO ASSIGNMENT GROUP,MIN DO,PERIOD,UNIT,UTILIZE POST DUTY REST,COUNT BLANK DAY
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASE")
			strBase = headeValue;
		if (header == "RANK")
			strRank = headeValue;
		if (header == "FLEET")
			strFleet = headeValue;
		if (header == "AL ASSIGNMENT GROUP")
			strALAssmGrp = headeValue;
		if (header == "# AL")
			strAL = headeValue;
		if (header == "DO ASSIGNMENT GROUP")
			strDOAssGrp = headeValue;
		if (header == "MIN DO")
			strMinDO = headeValue;
		if (header == "PERIOD")
			strPeriod = headeValue;
		if (header == "UNIT")
			strUnit = headeValue;

		if (header == "UTILIZE POST DUTY REST")
			bCountPostRest = (headeValue == "Y");
		if (header == "COUNT BLANK DAY")
			bBlankDay = (headeValue == "Y");
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> daysOffs, restAssignments, leaveGroup;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
	{
		if ((*assignment)->assignmentGroup == strDOAssGrp && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
		{
			daysOffs.push_back((*assignment)->assignemnt);
		}
		if ((*assignment)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
			restAssignments.push_back((*assignment)->assignemnt);
		if ((*assignment)->assignmentGroup == "LEA" && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
			leaveGroup.push_back((*assignment)->assignemnt);
	}
	time_t rollingWindow_start, rollingWindow_end;
	if (this->GetApplication() != ROSTER_OPTIMIZER && !rosters.empty())
	{
		rollingWindow_start = rosters[0]->actStrUtc;
		rollingWindow_end = rosters[rosters.size() - 1]->actEndUtc;
	}
	else
	{
		rollingWindow_start = this->_dbData->scenario.startDtUTC;
		rollingWindow_end = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	int iMonths = stoi(strPeriod);
	int iRequiredLeave = 0, iRequiredUpRange = 9999;
	if (strAL.find("-") != string::npos)
	{
		string lowRange = strAL.substr(0, strAL.find("-"));
		iRequiredLeave = stoi(lowRange);
		iRequiredUpRange = stoi(strAL.substr(strAL.find("-") + 1));
	}
	else
		iRequiredLeave = stoi(strAL);
	int iRequiredDO = stoi(strMinDO);
	if (rosters.size() == 0)
		return true;
	time_t tempStart = rosters[0]->actEndUtc;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, tempStart);
	int offsetMinutes = 0;
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	else
		base = _dbData->scenario.bases[0];
	map<time_t, time_t> mp;
	if (strUnit == "CM")
	{
		mp = Utility::GetInstancePtr()->getMonthRollingWindows(rollingWindow_start, rollingWindow_end, offsetMinutes, iMonths);
		for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); ++mp_it)
		{
			time_t start = (*mp_it).first;
			time_t end = (*mp_it).second;

			int iLeave = 0;
			string rosterDuty;
			for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
			{
				rosterDuty = (*roster)->duty;
				if (std::find(leaveGroup.begin(), leaveGroup.end(), rosterDuty) != leaveGroup.end())
					iLeave++;
			}

			if (strAL.find("-") == string::npos)
			{
				if (iLeave < iRequiredLeave)
					continue;
			}
			else
			{
				if (iLeave < iRequiredLeave || iLeave > iRequiredUpRange)
					continue;
			}

			int iDaysOff = 0;
			if (!bCountPostRest && !bBlankDay)
				iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end);
			else
				//iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRange(rosters, restAssignments, daysOffs, offset, rPostRest, start, end);
				iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, offsetMinutes, bBlankDay, bCountPostRest, this->_dbData->airportCodeMap, "", 1);
			if (iDaysOff < iRequiredDO)
			{
				string msg = "The number of days off(" + Utility::GetInstancePtr()->ToString(iDaysOff)+") must be at least " + strMinDO;
				msg += " if the crew has at least " + strAL + " annual leave days.";
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				//rv->rosterId = (*roster)->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = start;
				rv->endDTUtc = end;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
				rv->operation_result.insert(pair<string, string>("strMinDO", strMinDO));
				rv->operation_result.insert(pair<string, string>("strAL", strAL));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}
		}
	}

	return bReturn;
}

//8043
bool LegalityChecker::checkNextRosterAfterMovingPattern(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	//CHECK ASSIGNMENT AT NON BASE,PREVIOUS PATTERN ATTRIBUTE,NEXT ASSIGNMENT GROUP
	string strPrevRosterAttribute, strNextAssGroup;
	bool bNonBaseRoster = false;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "CHECK ASSIGNMENT AT NON BASE")
			bNonBaseRoster = (headeValue == "Y");
		if (header == "PREVIOUS PATTERN ATTRIBUTE")
			strPrevRosterAttribute = headeValue;
		if (header == "NEXT ASSIGNMENT GROUP")
			strNextAssGroup = headeValue;
	}

	if (!bNonBaseRoster)
		return true;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	string crewId = crew->idCrew;

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> assignmentGroup, restGroup;
	string airline = this->_dbData->scenario.airline;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); ++assign)
	{
		if ((*assign)->assignmentGroup == strNextAssGroup && (this->_dbData->version == 3 || (*assign)->airline == airline))
			assignmentGroup.push_back((*assign)->assignemnt);
		if ((*assign)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assign)->airline == airline))
			restGroup.push_back((*assign)->assignemnt);
	}

	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	string strPrimeBase;
	for (vector<SharedPtr<CREW_BASE>>::iterator iter = bases.begin(); iter != bases.end(); ++iter)
	{
		if ((*iter)->expUtc < 0 || (*iter)->expUtc == NULL)
		{
			(*iter)->expUtc = time(NULL) + 2 * 365 * 24 * 60 * 60;
		}
		//0002776: [8043]本籍組員B69196服勤完TPE任務回BASE後DO，不應顯示ERROR
		if ((*iter)->isPrime)
			if (Utility::GetInstancePtr()->isTimeOverlap((*iter)->effUtc, (*iter)->expUtc, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC))
				strPrimeBase = (*iter)->base;
	}

	if (strPrimeBase == "")
	{
		printf("8043:Exception, cannot find crew base.\n");
		return true;
	}


	int index = Utility::GetInstancePtr()->getFirstAttributeRoster(rosters, strPrevRosterAttribute);

	while (index != FAILURE)
	{
		int iCurrentIndex = index;

		if (iCurrentIndex + 1 >= (int)rosters.size())
			break;
		if (!(rosters[iCurrentIndex]->pairing) || (rosters[iCurrentIndex]->location == strPrimeBase))
		{
			iCurrentIndex++;
			index = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, iCurrentIndex, strPrevRosterAttribute);
			continue;
		}
		//string nextRosterDuty = rosters[iCurrentIndex + 1]->duty;
		//RULE[8027][8043][ExpatDO]-Expat crew Addtional Days Off Per Pattern
		int iNext = Utility::GetInstancePtr()->getNextWorkingRosterIndex(rosters, restGroup, iCurrentIndex);
		if (iNext == -1) {
			break; //no more working roster found
		}
		string nextRosterDuty = rosters[iNext]->duty;

		if (find(assignmentGroup.begin(), assignmentGroup.end(), nextRosterDuty) == assignmentGroup.end())
		{
			if (this->_application == ROSTER_OPTIMIZER && !(rosters[iCurrentIndex]->needRuleCheck) && !(rosters[iCurrentIndex + 1]->needRuleCheck))
			{
				index = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, iCurrentIndex, strPrevRosterAttribute);
				continue;
			}
			bReturn = false;
			string msg = "A moving pattern roster with attribute (" + strPrevRosterAttribute + ") must be followed by assignment group:" + strNextAssGroup;
			this->setLegalityMessage(rosters[iCurrentIndex], pCrew, singleRule, msg);
			pCrew->isLegal = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			rv->rosterId = rosters[iCurrentIndex]->rosterId;
			//rv->pairingId = (*roster)->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = rosters[iCurrentIndex]->actStrUtc;
			rv->endDTUtc = rosters[iCurrentIndex]->actEndUtc;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("strPrevRosterAttribute", strPrevRosterAttribute));
			rv->operation_result.insert(pair<string, string>("strNextAssGroup", strNextAssGroup));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
		index = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, iCurrentIndex, strPrevRosterAttribute);
	}

	return bReturn;
}

//8083
bool LegalityChecker::checkMaxDummyFt(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	if (singleRule->tableNum < 2)
		return bReturn;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	//BASE,RANK,FLEET,PERIOD,UNIT,MAX FT+SBY,SBY GROUP
	string strBase = "*", strRank = "*", strFleet = "*", strTeam = "*", strPeriod, strUnit, strMax, strSbyAssGroup, strType = "FT";
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")
			strBase = headeValue;
		if (header == "RANKS")
			strRank = headeValue;
		if (header == "FLEETS")
			strFleet = headeValue;
		if (header == "CREW TEAMS")
			strTeam = headeValue;

		if (header == "PERIOD")
			strPeriod = headeValue;
		if (header == "UNIT")
			strUnit = headeValue;
		if (header == "MAX DUMMY FT")
			strMax = headeValue;
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	bool isFd = (crew->division == "P");
	if (isFd)
	{
		printf("ERROR:8083 Cabin Rule Only.\n");
		return bReturn;
	}

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strTeam, "*", lCheckedStart, lCheckedEnd))
		return true;
	auto baseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(crew->getPrimeBase());
	auto sysBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"]);
	int gapMinutes = sysBaseOffsetMinutes - baseOffsetMinutes;

	string sbyTypes, dummyDays, dummFt;
	map<string, DUMMY_DAYS> sbyFts;
	map<string, string> sbyTypeMap;
	vector<string> types;
	for (auto& rule : this->_dbData->getRuleFunctions(RULES::DUMMY_FT_CHECK))
	{
		if (rule.tableNum != 1)
			continue;
		auto& parameter = rule.params;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

			if (header == "SBY TYPES")
				sbyTypes = headeValue;
			if (header == "DUMMY DAYS")
				dummyDays = headeValue;
			if (header == "DUMMY FT")
				dummFt = headeValue;
		}
		if (sbyTypes.size() == 0 || sbyTypes == "*")
		{
			printf("ERROR: 8083-SBY TYPES parameter.\n");
			return true;
		}
		int iDays = isHHmm(dummyDays.c_str()) ? hhmmToMinutes(dummyDays.c_str()) : atoi(dummyDays.c_str());
		int iFt = isHHmm(dummFt.c_str()) ? hhmmToMinutes(dummFt.c_str()) : atoi(dummFt.c_str());
		split(sbyTypes, '|', types);
//		boost::split(types, sbyTypes, boost::is_any_of("|"), boost::token_compress_on);
		for (auto single : types)
		{
			DUMMY_DAYS temp;
			temp.dummyDays = iDays;
			temp.dummyFt = iFt;
			sbyTypeMap.insert(pair<string, string>(single, single));
			sbyFts.insert(pair<string, DUMMY_DAYS>(single, temp));
		}
	}

	int iMaxDummyFt = isHHmm(strMax.c_str()) ? hhmmToMinutes(strMax.c_str()) : atoi(strMax.c_str());
	map<time_t, time_t> mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(strUnit, strPeriod, this->_dbData->scenario.startDtUTC + gapMinutes * 60, this->_dbData->scenario.endDtUTC + 24 *3600 + gapMinutes * 60, weekdayStartFrom, baseOffsetMinutes);
	vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;

	for (const auto& range : mpRange)
	{
		//0004015: Lisa回報8083優化未阻擋
		//if (crew->idCrew == "304291" && range.first > 1533398400 && range.first < 1533571200)
		//	printf("");
		//get the first fly roster backward
		int iLastFlyIndex = -1, iLastRosterIndex = -1;
		for (int i = (int)rosters.size() - 1; i > 0; i--)
		{
			if (!(rosters[i]->actStrUtc <= range.second + 24 * 3600 && rosters[i]->actStrUtc >= range.first))
				continue;
			string assignment = rosters[i]->duty;
			if (iLastRosterIndex < 0)
				iLastRosterIndex = i;
			if (iLastFlyIndex < 0 && assignment == "FLY")
			{
				iLastFlyIndex = i;
				break;
			}
		}
		if (iLastRosterIndex < 0)
			continue;
		//calculate dummy ft
		time_t checkTime = range.first;
		int dummyFt = 0;
		int offsetMinutes = 0;
		for (int j = iLastFlyIndex + 1; j < iLastRosterIndex + 1; j++)
		{
			if (rosters[j]->actStrUtc < checkTime)
				continue;
			string standby = rosters[j]->qualifier;
			map<string, DUMMY_DAYS>::iterator sbyIt = sbyFts.find(standby);
			if (sbyIt != sbyFts.end())
			{
				DUMMY_DAYS sbTimes = sbyIt->second;
				offsetMinutes = this->_dbData->getAirportOffsetMinutes(rosters[j]->location);
				time_t localStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[j]->actStrUtc, offsetMinutes);
				int iDays = static_cast<int>(min(localStart + sbTimes.dummyDays * 24 * 3600, range.second + 24 * 3600) - localStart) / (24 * 3600);
				checkTime = localStart + iDays * 24 * 3600;
				dummyFt += iDays * sbTimes.dummyFt;
			}
		}

		if (dummyFt <= 0)
			continue;

		double iCumFt = 0;
		for (size_t j = 0; j < cabin.size(); j++)
		{
			//20181215 ain, mantis#4544, 结束条件无需 +24*3600修正, 直接按 manday.utc <= range.second
			if (cabin[j]->crewDateUtc >= (range.first) && cabin[j]->crewDateUtc <= range.second)
			{
				iCumFt += cabin[j]->ft;
			}
		}

		if (dummyFt + (int)iCumFt > iMaxDummyFt)
		{
			char startUtcStr[30] = { 0 };
			char endUtcStr[30] = { 0 };
			Utility::GetInstancePtr()->UTCToUTCStr(range.first + (time_t)baseOffsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
			Utility::GetInstancePtr()->UTCToUTCStr(range.second + (time_t)24 * 3600 + (time_t)baseOffsetMinutes * 60, endUtcStr, sizeof(endUtcStr));
			bReturn = false;

			string msg = "The crew's cumulative dummy flight time (Dummy={0:dummyFtHHmm}, Actual={1:iCumFtHHmm}) exceeds the limitation ({2:strMax}) in the window (UTC: {3:startUtcStr}-{4:endUtcStr}).";
			msg = StringUtils::Format(msg, Utility::GetInstancePtr()->formatMinutes(dummyFt), Utility::GetInstancePtr()->formatMinutes((int)iCumFt),
				strMax, startUtcStr, endUtcStr);

			this->setLegalityMessage(crew, pCrew, singleRule, msg);
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			pCrew->isLegal = false;
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			//rv->rosterId = rosters[iCurrentIndex]->rosterId;
			//rv->pairingId = (*roster)->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = range.first;
			rv->endDTUtc = range.second + 24 * 3600 - 1;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			string typeSet = "";
			for (auto s : sbyTypeMap){
				if (typeSet == ""){
					typeSet += s.first;
					continue;
				}
				typeSet += "|" + s.first;
			}
			rv->operation_result.insert(pair<string, string>("dummyFt", Utility::GetInstancePtr()->formatMinutes(dummyFt)));
			rv->operation_result.insert(pair<string, string>("iCumFt", Utility::GetInstancePtr()->formatMinutes((int)iCumFt)));
			rv->operation_result.insert(pair<string, string>("sbyTypes", typeSet));
			rv->operation_result.insert(pair<string, string>("strMax", strMax));
			rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
			rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
	}

	return bReturn;
}


bool LegalityChecker::checkMaxFTSBY(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	//BASE,RANK,FLEET,PERIOD,UNIT,MAX FT+SBY,SBY GROUP
	string strBase, strRank, strFleet, strPeriod, strUnit, strMax, strSbyAssGroup, strType = "FT";
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASE")
			strBase = headeValue;
		if (header == "RANK")
			strRank = headeValue;
		if (header == "FLEET")
			strFleet = headeValue;

		if (header == "PERIOD")
			strPeriod = headeValue;
		if (header == "UNIT")
			strUnit = headeValue;
		if (header == "MAX TIME TYPE+SBY")
			strMax = headeValue;
		if (header == "SBY GROUP")
			strSbyAssGroup = headeValue;
		if (header == "TIME TYPE")
			strType = headeValue;
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	int iMax = isHHmm(strMax.c_str()) ? hhmmToMinutes(strMax.c_str()) : atoi(strMax.c_str());

	vector<SharedPtr<CREW_MANDAY_FD>>& cfd = crew->mandayFdList;
	vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;
	std::stable_sort(cfd.begin(), cfd.end(), cmpFD);
	std::stable_sort(cabin.begin(), cabin.end(), cmpCC);

	bool isFd = (crew->division == "P");
	map<time_t, time_t>::iterator iter_date;
	map<time_t, time_t> mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(strUnit, strPeriod, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600, weekdayStartFrom);
	string base;
	for (vector<SharedPtr<CREW_BASE>>::iterator it = bases.begin(); it != bases.end(); ++it)
	{
		if ((*it)->isPrime)
		{
			base = (*it)->base;
		}
	}
	if (base == "") base = "PEK";
	auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	vector<SharedPtr<DBRule_8014>> asnGroup = this->_dbData->rule_8014;

	vector<string> vSBYs;
	if (strSbyAssGroup != "*")
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = asnGroup.begin(); assignment != asnGroup.end(); ++assignment)
		{
			if ((*assignment)->assignmentGroup == strSbyAssGroup)
			{
				vSBYs.push_back((*assignment)->assignemnt);
			}
		}
	}
	//20190418 ain, mantis#5183, 改栈对象避免 leak
	//BasicCalculation* sbyCal = new BasicCalculation();
	BasicCalculation sbyCal;
	sbyCal.setRuleEngine(this);
	for (iter_date = mpRange.begin(); iter_date != mpRange.end(); ++iter_date)
	{

		double iCumFDP = 0, iCumBlh = 0, iCumFt = 0, iCumDP = 0;
		if (isFd)
		{
			for (size_t j = 0; j < cfd.size(); j++)
			{
				if (cfd[j]->crewDateUtc >= (iter_date->first - iOffsetMinutes * 60) && cfd[j]->crewDateUtc <= (iter_date->second - iOffsetMinutes * 60))
				{
					iCumFt += cfd[j]->ft;
					iCumFDP += cfd[j]->fdp;
					iCumDP += cfd[j]->dp;
					iCumBlh += cfd[j]->blh;
				}
			}
		}
		else
		{
			for (size_t j = 0; j < cabin.size(); j++)
			{
				if (cabin[j]->crewDateUtc >= (iter_date->first - iOffsetMinutes * 60) && cabin[j]->crewDateUtc <= (iter_date->second - iOffsetMinutes * 60))
				{
					iCumFt += cabin[j]->ft;
					iCumFDP += cabin[j]->fdp;
					iCumDP += cabin[j]->dp;
					iCumBlh += cabin[j]->blh;
				}
			}
		}

		double lSbyTime = (double)sbyCal.getSBYInARange(rosters, iter_date->first, iter_date->second, vSBYs);

		if (lSbyTime <= 0)
			continue;

		if (strType == "FT")
			lSbyTime += iCumFt;
		else if (strType == "FDP")
			lSbyTime += iCumFDP;
		else if (strType == "DP")
			lSbyTime += iCumDP;
		else if (strType == "BLH")
			lSbyTime += iCumBlh;
		else
			return true;

		if ((int)lSbyTime > iMax)
		{
			string temp = Utility::GetInstancePtr()->formatMinutes((int)lSbyTime);

			bReturn = false;
			string msg = "The crew's cumulative " + strType + " stanby time(" + temp + ") exceeds the limitation(" + strType + "=" + strMax + ").";
			this->setLegalityMessage(crew, pCrew, singleRule, msg);
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			pCrew->isLegal = false;
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			//rv->rosterId = rosters[iCurrentIndex]->rosterId;
			//rv->pairingId = (*roster)->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = iter_date->first - iOffsetMinutes * 60;
			rv->endDTUtc = iter_date->second - iOffsetMinutes * 60;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("strType", strType));
			rv->operation_result.insert(pair<string, string>("temp", temp));
			rv->operation_result.insert(pair<string, string>("strType", strType));
			rv->operation_result.insert(pair<string, string>("strMax", strMax));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}

		}
	}

	//delete sbyCal;
	//sbyCal = NULL;

	return bReturn;
}


int LegalityChecker::beforeNonConsWorkingRoster(vector<SharedPtr<ROSTER>> rosters, int startIndex, vector<string> workingRosterDuty)
{
	//next of non working roster or non consuecutive rest roster
	int index = startIndex;

	if (startIndex + 1 >= (int)rosters.size())
		return index;

	string rosterDuty;
	time_t prevEnd, currStart;
	string location;
	
	for (std::size_t j = startIndex + 1; j < rosters.size(); j++)
	{
		rosterDuty = rosters[j]->duty;
		if (std::find(workingRosterDuty.begin(), workingRosterDuty.end(), rosterDuty) != workingRosterDuty.end())
		{
			prevEnd = rosters[index]->actRestStrUtc;
			currStart = rosters[j]->actStrUtc;
			location = rosters[j]->location;
			auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(location);
			time_t temp = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevEnd, iOffsetMinutes) + 24 * 3600;
			time_t temp1 = Utility::GetInstancePtr()->getLocalDayStartInUTC(currStart, iOffsetMinutes);
			if (temp != temp1)
			{
				break;
			}
			else
				index = (int)j;
		}
		else
			break;
	}
	return index;
}




bool LegalityChecker::checkXFLYInYDays(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	//BASE,RANK,FLEET,#WORKS,MIN RESTS,WORKING ASSIGNMENT GROUPS,REST ASSIGNMENT GROUPS
	//*,*,*,6,1,FLY;SBY;GND;TRG,DO;LEA;LO
	//FLY|RB|GND|TRG|DO|LEA|CMT|MVO|MVP|EXT|RES
	//FLY-MVP|GND-MVP|MVP-GND
	//RB-FLY|RB-MVO|RB-MVP
	string header, headeValue;
	string strCheckedGroups, nonOverlapGroups, overlapGroups, strMax, strBase, strRank, strFleet, strTeam;
	bool checkByBrief = false;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")
			strBase = headeValue;
		else if (header == "RANKS")
			strRank = headeValue;
		else if (header == "FLEETS")
			strFleet = headeValue;
		else if (header == "TEAMS")
			strTeam = headeValue;
		else if (header == "ASSIGNMENTS:ONLY ONE ROSTER IN ONE DAY")
			strCheckedGroups = headeValue;
		else if (header == "EXCEPTION1(NON-OVERLAP)(DIRECTIONAL)")
			nonOverlapGroups = headeValue;
		else if (header == "EXCEPTION2(OVERLAP)(DIRECTIONAL)")
			overlapGroups = headeValue;
		else if (header == "CHECK BY BRIEF")
			checkByBrief = headeValue == "Y";
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	std::size_t rosterSize = rosters.size();
	if (rosters.size() == 0)
		return true;

	vector<string> strGroups;
	vector<string> strNonOverlapGroups;
	vector<string> strOverlapGroups;
	split(strCheckedGroups, '|', strGroups);
	split(nonOverlapGroups, '|', strNonOverlapGroups);
	split(overlapGroups, '|', strOverlapGroups);
	//boost::split(strGroups, strCheckedGroups, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(strNonOverlapGroups, nonOverlapGroups, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(strOverlapGroups, overlapGroups, boost::is_any_of("|"), boost::token_compress_on);

	string rosterDuty;
	int iPrevRoster = 0;
	int offsetMinutes = 0;

	offsetMinutes = this->_dbData->getAirportOffsetMinutes(crew->getPrimeBase());
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strTeam, "*", lCheckedStart, lCheckedEnd))
		return true;

	for (std::size_t i = 0; i < rosterSize; i++)
	{
		rosterDuty = rosters[i]->duty;
		int iPrevDayAssignmentOffsetMinutes = offsetMinutes;
		int iCurrDayAssignmentOffsetMinutes = offsetMinutes;
		if (std::find(strGroups.begin(), strGroups.end(), rosterDuty) != strGroups.end())
		{
			if (i != iPrevRoster)
			{
				time_t lPrevLocalStart, lPrevLocalEnd, lCurrLocalStart;
				if (this->_dbData->scenario.airline != "BR" || rosters[iPrevRoster]->pairing)
				{
					lPrevLocalStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[iPrevRoster]->actStrUtc, offsetMinutes);
					lPrevLocalEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[iPrevRoster]->actRestStrUtc, offsetMinutes);
					if (checkByBrief) {
						const auto& prevBrief = rosters[iPrevRoster]->pairing->getFirstDuty()->getFirstBreif();
						lPrevLocalStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevBrief->getStartTimeUtcAct(), offsetMinutes);
						lPrevLocalEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevBrief->getEndTimeUtcAct(), offsetMinutes);
					}
				}
				else
				{
					iPrevDayAssignmentOffsetMinutes = this->_dbData->getAirportOffsetMinutes(rosters[iPrevRoster]->location);
					lPrevLocalStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[iPrevRoster]->actStrUtc, iPrevDayAssignmentOffsetMinutes);
					lPrevLocalEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[iPrevRoster]->actRestStrUtc, iPrevDayAssignmentOffsetMinutes);
					if (checkByBrief && rosters[iPrevRoster]->pairing) {
						const auto& prevBrief = rosters[iPrevRoster]->pairing->getFirstDuty()->getFirstBreif();
						lPrevLocalStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevBrief->getStartTimeUtcAct(), offsetMinutes);
						lPrevLocalEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevBrief->getEndTimeUtcAct(), offsetMinutes);
					}
				}
				if (!checkByBrief && lPrevLocalEnd < rosters[iPrevRoster]->actRestStrUtc)
					lPrevLocalEnd += 24 * 3600;

				if (this->_dbData->scenario.airline != "BR" || rosters[i]->pairing)
				{
					lCurrLocalStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[i]->actStrUtc, offsetMinutes);
					if (checkByBrief) {
						const auto& currentBrief = rosters[i]->pairing->getFirstDuty()->getFirstBreif();
						lCurrLocalStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(currentBrief->getStartTimeUtcAct(), offsetMinutes);
					}
				}
				else
				{
					iCurrDayAssignmentOffsetMinutes = this->_dbData->getAirportOffsetMinutes(rosters[i]->location);
					lCurrLocalStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[i]->actStrUtc, iCurrDayAssignmentOffsetMinutes);
					if (checkByBrief && rosters[i]->pairing) {
						const auto& currentBrief = rosters[i]->pairing->getFirstDuty()->getFirstBreif();
						lCurrLocalStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(currentBrief->getStartTimeUtcAct(), offsetMinutes);
					}
				}

				if (this->_dbData->scenario.airline == "BR")
				{
					// Day Start切分邊界有重疊時, 以Day Assignment的時區為準
					if (iCurrDayAssignmentOffsetMinutes != offsetMinutes && lPrevLocalEnd == lCurrLocalStart + TimezoneUtils::abs(iCurrDayAssignmentOffsetMinutes - offsetMinutes) * 60)
					{
						lPrevLocalEnd = lCurrLocalStart;
					}
					else if (iPrevDayAssignmentOffsetMinutes != offsetMinutes && lPrevLocalEnd == lCurrLocalStart + TimezoneUtils::abs(iPrevDayAssignmentOffsetMinutes - offsetMinutes) * 60)
					{
						lCurrLocalStart = lPrevLocalEnd;
					}
				}

				if (!checkByBrief && lCurrLocalStart >= lPrevLocalStart && lCurrLocalStart < lPrevLocalEnd)
				{
					string checkedDutys = rosters[iPrevRoster]->duty + '-' + rosters[i]->duty;
					bool isPlaning = Utility::GetInstancePtr()->isTrackingOrPlaning(rosters[i]->actStrUtc);
					if ((singleRule->phase == 1 && isPlaning) || (singleRule->phase == 3 && !isPlaning) || (singleRule->phase == 1 && !isPlaning)) {
						if (rosters[iPrevRoster]->actRestStrUtc <= rosters[i]->actStrUtc && std::find(strNonOverlapGroups.begin(), strNonOverlapGroups.end(), checkedDutys) != strNonOverlapGroups.end()) {
							continue;
						}
						if (rosters[iPrevRoster]->actRestStrUtc > rosters[i]->actStrUtc && std::find(strOverlapGroups.begin(), strOverlapGroups.end(), checkedDutys) != strOverlapGroups.end()) {
							continue;
						}
					}
					else {
						continue;
					}
					if (/*isPlaning && */this->_application == ROSTER_OPTIMIZER && (!(rosters[i]->needRuleCheck) && !(rosters[iPrevRoster]->needRuleCheck)))
						continue;
					bReturn = false;
					string msg = "Only one roster allowed (" + strCheckedGroups + ") in one local day.";
					this->setLegalityMessage(rosters[i], pCrew, singleRule, msg);
					pCrew->isLegal = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = rosters[i]->rosterId;
					//rv->pairingId = (*roster)->pairId;
					//rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = min(lPrevLocalEnd - 24 * 3600, rosters[i]->actStrUtc);
					rv->endDTUtc = min(lPrevLocalEnd, rosters[i]->actRestStrUtc);
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("strCheckedGroups", strCheckedGroups));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
				if (checkByBrief && (lPrevLocalStart == lCurrLocalStart || lPrevLocalEnd == lCurrLocalStart)) {
					string checkedDutys = rosters[iPrevRoster]->duty + '-' + rosters[i]->duty;
					bool isPlaning = Utility::GetInstancePtr()->isTrackingOrPlaning(rosters[i]->actStrUtc);
					if ((singleRule->phase == 1 && isPlaning) || (singleRule->phase == 3 && !isPlaning) || (singleRule->phase == 1 && !isPlaning)) {
						if (rosters[iPrevRoster]->actRestStrUtc <= rosters[i]->actStrUtc && std::find(strNonOverlapGroups.begin(), strNonOverlapGroups.end(), checkedDutys) != strNonOverlapGroups.end()) {
							continue;
						}
						if (rosters[iPrevRoster]->actRestStrUtc > rosters[i]->actStrUtc && std::find(strOverlapGroups.begin(), strOverlapGroups.end(), checkedDutys) != strOverlapGroups.end()) {
							continue;
						}
					}
					else {
						continue;
					}
					if (/*isPlaning && */this->_application == ROSTER_OPTIMIZER && (!(rosters[i]->needRuleCheck) && !(rosters[iPrevRoster]->needRuleCheck)))
						continue;
					bReturn = false;
					string msg = "Only one brief allowed (" + strCheckedGroups + ") in one local day.";
					this->setLegalityMessage(rosters[i], pCrew, singleRule, msg);
					pCrew->isLegal = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = rosters[i]->rosterId;
					//rv->pairingId = (*roster)->pairId;
					//rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = min(lPrevLocalEnd - 24 * 3600, rosters[i]->actStrUtc);
					rv->endDTUtc = min(lPrevLocalEnd, rosters[i]->actRestStrUtc);
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("strCheckedGroups", strCheckedGroups));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						return false;
					}
				}
			}
			iPrevRoster = (int)i;
		}
	}

	return bReturn;
}

bool LegalityChecker::checkMaxConsecutiveRosterWithAttr(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strBase, strRank, strFleet, strAttribute, strMax;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")
			strBase = headeValue;
		if (header == "RANKS")
			strRank = headeValue;
		if (header == "FLEETS")
			strFleet = headeValue;
		//MUST be consecutive days and rosters
		if (header == "MAX TIMES")
			strMax = headeValue;
		if (header == "ATTRIBUTES")
			strAttribute = headeValue;
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	int iMax = stoi(strMax);
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC - (iMax + 1) * 24 * 3600;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + (iMax + 1) * 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;
	int index = Utility::GetInstancePtr()->getFirstAttributeRoster(rosters, strAttribute);
	int iConsecutiveRosters = 0;
	int iNextIndex = index;
	int prevOffsetMinutes = 0, currOffsetMinutes = 0;
	while (index != FAILURE)
	{
		iConsecutiveRosters = 1;
		time_t start = rosters[index]->actStrUtc;
		prevOffsetMinutes = this->_dbData->getAirportOffsetMinutes(rosters[index]->location);
		time_t end = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, prevOffsetMinutes) + (iMax + 1) * 24 * 3600;
		if (start >= lCheckedStart && start <= lCheckedEnd)
		{
			iNextIndex = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, index, strAttribute);
			bool allPrevAssigned = (rosters[index]->source == "PA");
			time_t prevStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[index]->actStrUtc, prevOffsetMinutes);

			while (iNextIndex != FAILURE)
			{
				allPrevAssigned = (allPrevAssigned) && (rosters[iNextIndex]->source == "PA");
				currOffsetMinutes = this->_dbData->getAirportOffsetMinutes(rosters[iNextIndex]->location);
				time_t currStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[iNextIndex]->actStrUtc, currOffsetMinutes);
				if ((rosters[iNextIndex]->actStrUtc >= start) && (rosters[iNextIndex]->actStrUtc <= lCheckedEnd)
					&& (iNextIndex - index == iConsecutiveRosters)
					&& (currStart - prevStart + (currOffsetMinutes - prevOffsetMinutes) * 60 == iConsecutiveRosters * 24 * 3600))
				{
					iConsecutiveRosters++;
					//prevOffset = currOffset;
				}
				else
				{
					//iConsecutiveRosters = 0;
					break;
				}
				iNextIndex = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, iNextIndex, strAttribute);
			}

			if (iConsecutiveRosters > iMax)
			{
				//long msgEnd;
				//if (iNextIndex != FAILURE)
				//	msgEnd = rosters[iNextIndex]->actRestStrUtc;
				//else
				//	msgEnd = end;
				if (this->_application == ROSTER_OPTIMIZER && (allPrevAssigned))
				{
					index = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, index, strAttribute);
					continue;
				}
				bReturn = false;
				string msg = "The actual number of consecutive rosters(" + Utility::GetInstancePtr()->ToString(iConsecutiveRosters)+") with attribute(" + strAttribute + ") exceeds the maximum allowed (" + strMax + ").";
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				//rv->rosterId = rosters[i]->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = start;
				rv->endDTUtc = end;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iConsecutiveRosters", Utility::GetInstancePtr()->ToString(iConsecutiveRosters)));
				rv->operation_result.insert(pair<string, string>("strAttribute", strAttribute));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}

			}
		}

		index = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, index, strAttribute);
	}

	return bReturn;
}




//INSTRUCTOR_STUDENT_BOUND (8074)
//	if roster no pairing, then skip
//  if crew.team is empty, then skip
//	if crew.rank == PS, then skip
//  if crew.team role!=student, then skip
//	if crew not match rule 8074 base/rank/fleet/team, then skip
//	for roster.pairing.duty.segment.flight
//		find instructor 'same team' in cof[flt_id]
//		if NOT found
//			add violation
bool LegalityChecker::checkInstructorStudentBound(RULE_LEGALITY * pCrew, const DBRule* singleRule) {

	rule8074 * cache = (rule8074*)singleRule->parsedParam.get();
	string strBase = cache->strBase;
	string strRank = cache->strRank;
	string strFleet = cache->strFleet;
	string strCrewTeam = cache->strTeam;
	bool isLegal = true;
	//
	SharedPtr<CREW>& crew = _dbData->crewList[pCrew->crewIndex];
	if (crew->rosterList.size() == 0) {
		return true;
	}
	if (crew->teamList.size() == 0) {
		return true;
	}
	//mantis#2205, int(rosterIndex) > unsigne int(rosterList.size)总返回true，改为int对比 RosterIndex > (int)rosterList.size()
	//roster
	if (pCrew->RosterIndex > (int)crew->rosterList.size()) {
		Logger::getRuleLogger()->error("ERROR: rule 8074 fail, invalid param rosterIndex={} not exist on crew={}", pCrew->RosterIndex, crew->idCrew);
		return false;
	}
	//roster loop begin/end
	vector<SharedPtr<ROSTER>>::iterator checkRosterBeg = crew->rosterList.begin();
	vector<SharedPtr<ROSTER>>::iterator checkRosterEnd = crew->rosterList.end();
	if (pCrew->RosterIndex != -1) {
		checkRosterBeg = crew->rosterList.begin() + pCrew->RosterIndex;
		checkRosterEnd = checkRosterBeg + 1;
	}
	for (auto& it = checkRosterBeg; it != checkRosterEnd; it++) {

		SharedPtr<ROSTER> roster = (*it); //mantis#2205, 按iterator遍历roster
		//skip on no-pairing/no-team/rank=PS/not-student/not-match-rule
		if (roster->pairId == 0) {
			continue;
		}
		//PS
		bool isPS = false;
		for (auto& cr : crew->rankList) {
			if (cr->rank == "PS" && roster->actStrUtc >= cr->effUtc  && roster->actStrUtc < cr->expUtc) {
				isPS = true; break;
			}
		}
		if (isPS) {
			continue;
		}
		//Student
		bool isStudent = false;
		string crewTeamName = "";
		for (auto& ct : crew->teamList) {
			if (ct->role == "S" && roster->actStrUtc >= ct->effDt  && roster->actStrUtc < ct->expDt) {
				isStudent = true; crewTeamName = ct->teamName; break;
			}
		}
		if (!isStudent) {
			continue;
		}
		//base/rank/fleet/team
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strCrewTeam, "*", roster->actStrUtc, roster->actEndUtc)) {
			continue;
		}
		//check cof, find flt_id without instructor
		bool noInstructorOnFlight = false;
		for (std::size_t i = 0; i < roster->pairing->getNumDuties(); i++) {
			Duty * duty = roster->pairing->getDuty(i);
			for (std::size_t j = 0; j < duty->getNumSegments(); j++) {
				Segment * seg = duty->getSegment(j);
				long long flt_id = seg->getDBId();
				bool foundInstructorInSameTeam = false;
				for (auto& cof : this->_dbData->crewOnFlt[flt_id]) {
					SharedPtr<CREW>& otherCrew = _dbData->crewIdMap[cof->crewId];
					bool isInstructorInSameTeam = false;
					for (auto& ct : otherCrew->teamList) {
						if (ct->role == "I" && ct->teamName == crewTeamName && roster->actStrUtc >= ct->effDt  && roster->actStrUtc < ct->expDt) {
							foundInstructorInSameTeam = true; break;
						}
					}
					if (foundInstructorInSameTeam)
						break;
				}
				//violation
				if (!foundInstructorInSameTeam) {
					isLegal = false;
					string msg = "No instructor found on flight (id={0:flt_id}) of pairing (id={1:pairId}) for crew {2:idCrew} under team {3:crewTeamName}.";
					msg = StringUtils::Format(msg, flt_id, roster->pairId, crew->idCrew, crewTeamName);

					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(seg, singleRule, msg);
					pCrew->isLegal = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = (roster)->rosterId;
					rv->pairingId = (roster)->pairId;
					rv->dutySequenceNumber = (duty)->getDutySegNum();
					rv->segmentId = seg->getSegmentId();
					rv->startDTUtc = seg->getStartTimeUtcAct();
					rv->endDTUtc = seg->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("flt_id", Utility::GetInstancePtr()->llToa(flt_id)));
					rv->operation_result.insert(pair<string, string>("crewTeamName", crewTeamName));
					rv->violation_msg = msg;
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
			}
		}
	}
	return isLegal;
}

void LegalityChecker::resetMinRestInRoster(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strType = "FDP", rangeStart = "0", rangeEnd = "9999", minRest = "";
	map<string, string> parameter = singleRule->params;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "TYPE") {
			strType = headeValue;
		}
		//12:00
		if (header == "RANGE BEGIN WITH") {
			rangeStart = headeValue;
		}
		if (header == "RANGE END WITH") {
			rangeEnd = headeValue;
		}
		if (header == "MIN REST") {
			minRest = headeValue;
		}
	}
	//ONLY FOR EVA
	if (strType != "FDP" || _dbData->scenario.airline != "BR")
	{
		if (_debug)
			printf("8080:For roster, only support reset min rest by FDP.");
		return;
	}
	int iRangeStart = isHHmm(rangeStart.c_str()) ? hhmmToMinutes(rangeStart.c_str()) : atoi(rangeStart.c_str());
	int iRangeEnd = isHHmm(rangeEnd.c_str()) ? hhmmToMinutes(rangeEnd.c_str()) : atoi(rangeEnd.c_str());
	int iMinRest = isHHmm(minRest.c_str()) ? hhmmToMinutes(minRest.c_str()) : atoi(minRest.c_str());

	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	auto offsetMinutes = _dbData->getAirportOffsetMinutes(crew->getPrimeBase());
	int extFdp = 0;
	//start from the second roster
	for (std::size_t i = 1; i < rosters.size(); ++i)
	{
		if (rosters[i]->duty != "FLY")
			continue;
		if (!(rosters[i]->pairing))
			continue;

		//if (rosters[i]->pairId == 1491413 && crew->idCrew == "F51070")
		//	printf("");

		vector<Duty *> duties = rosters[i]->pairing->getDutyVec();
		if (duties.size() > 0)
		{
			bool needRest = false;
			if (Utility::GetInstancePtr()->isTimeOverlap(rosters[i - 1]->actStrUtc, rosters[i - 1]->actRestStrUtc, duties[0]->getStartTimeUtcAct(), duties[0]->getEndTimeUtcAct())
				&& rosters[i - 1]->duty == "RB")
			{
				needRest = true;
			}
			else if (rosters[i - 1]->duty == "GND")
			{
				time_t localStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[i - 1]->actRestStrUtc, offsetMinutes);
				if (localStart == Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[i]->actStrUtc, offsetMinutes))
					needRest = true;
			}
			if (needRest)
			{
				extFdp = static_cast<int>(duties[0]->getStartTimeUtcAct() - rosters[i - 1]->actStrUtc) / 60;
				int Fdp = extFdp + duties[0]->getFDPInSecs() / 60;

				if (Fdp >= iRangeStart  && Fdp <= iRangeEnd)
				{
					if (extFdp == 0)
						duties[0]->setMinRest(iMinRest);
					else
						rosters[i]->dutyValues.setMinRest(0, iMinRest);
				}

			}
		}
	}
}


void LegalityChecker::setMinRestByFDP(Pairing * pPairing, SharedPtr<ROSTER> roster)
{
	if (this->_application == ROSTER_OPTIMIZER)
	{
		if (_debug)
			printf("8080:the pairing rules are not designed for roster optimizer.\n");
		return;
	}

	//if (roster && (roster->rosterId == 184048 || roster->rosterId == 259097))
	//	printf("");

	int callinSBY_FDPMins = roster ? roster->callinSBY_FDPMins : 0;
	if (!(pPairing))
		return;
	auto& dutyBuilder = this->_dbData->getRuleFunctions(RULES::SET_MIN_REST_BY_FDP);
	if (dutyBuilder.size() <= 0)
		return;
	//vector<Duty *> duties = pPairing->getDutyVec();
	string base = pPairing->getBase();
	map<string, string>::const_iterator iter;
	string header, headeValue, pExceptions;
	string strType = "FDP", rangeStart = "00:00", rangeEnd = "99:99", minRest = "00:00", minBaseRest = "00:00";
	for (size_t iRule = 0; iRule < dutyBuilder.size(); ++iRule)
	{
		auto& singleRule = dutyBuilder[iRule];
		auto& parameter = singleRule.params;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			if (header == "TYPE") {
				strType = headeValue;
			}
			//12:00
			if (header == "RANGE BEGIN WITH") {
				rangeStart = headeValue;
			}
			if (header == "RANGE END WITH") {
				rangeEnd = headeValue;
			}
			if (header == "MIN REST") {
				minRest = headeValue;
			}
			if (header == "MIN REST AT BASE") {
				minBaseRest = headeValue;
			}
			if (header == "EXCEPTION FOR NEXT QUALIFIERS") {
				pExceptions = headeValue;
			}
		}

		int iRangeStart = Utility::GetInstancePtr()->convertToMinutes(rangeStart);
		int iRangeEnd = Utility::GetInstancePtr()->convertToMinutes(rangeEnd);
		int iMinRest = Utility::GetInstancePtr()->convertToMinutes(minRest);
		int iMinBaseRest = Utility::GetInstancePtr()->convertToMinutes(minBaseRest);

		vector<string> exceptions;
		split(pExceptions, '|', exceptions);
//		boost::split(exceptions, pExceptions, boost::is_any_of("|"), boost::token_compress_on);

		long iType = 0;
		//for (auto duty : duties)
		for (std::size_t i = 0; i < pPairing->getNumDuties(); i++)
		{
			//mantis#4217, 若计算目标为roster, 则获取roster单独修正后value, 否则从原始duty获取
			Duty* duty = pPairing->getDuty(i);
			if (roster) {
				if (strType == "FDP")
				{
					iType = max((int)(duty->getFDPInSecs()) / 60, roster->dutyValues.getPlnFdp(i));
				}
				else
					iType = roster->dutyValues.get(i, strType);//roster单独修正后fdp/dp, 如前置sby overlap造成fdp延长
			}
			if (iType == 0 || !roster) {
				if (strType == "FDP") {
					iType = duty->getFDPInSecs() / 60;

					if (iType == 0)
					{
						CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
						//duty->calculateFDP(0, FDP.str, FDP.end);
						iType = duty->getFDPInSecs() / 60;
					}
				}
				else if (strType == "FT") {
					iType = duty->getBLKInMins();
				}
				else if (strType == "DP") {
					iType = duty->getDPInSecs() / 60;
				}
				else
				{
					printf("8080: Unsupported rule parameters, name=Type");
					break;
				}
			}

			//Mantis4340 EVA sepcial logic
			//20181204 ain, mantis#4560, EVA special logic同时作用在 duty.minRest/roster.dutyValues.minRest
			//duty为Opr去Pnc回时, 计算fdp不算Pnc, 但计算minRest需要按虚拟fdp包括P计算
			//if (pPairing->getDbId() == 1584469)
			//	printf("");
			if (strType == "FDP" && this->_dbData->scenario.airline == "BR")
			{
				const vector<Segment*>& segments = duty->getSegments();
				//0004672: FDP剛好12H，法定休時12H，PTN info顯示錯誤MRT。
				//仅仅使用于T/R的PAIRING
				if (segments.size() == 2 && iType > 0 && pPairing->getNumDuties() == 1)
				{
					if (segments[segments.size() - 2]->getAssignment() == "OPR" && segments[segments.size() - 1]->getAssignment() == "PNC")
						iType += static_cast<long>(segments[segments.size() - 1]->getEndTimeUtcAct() - segments[segments.size() - 2]->getEndTimeUtcAct()) / 60;
				}
			}
			//mantis#5342, callinSBY_FDPMins在roster->dutyValues已經加過, 不應重複累加
			if (duty->getDutySeq() == 1 && callinSBY_FDPMins > 0 && !roster)
				iType += callinSBY_FDPMins;

			//20181028 ain, mantis#4217, 若计算目标为roster则更新roster.minRest, 否则更新duty.minRest
			if (iType >= iRangeStart  && iType <= iRangeEnd)
			{
				int value = duty->getArrivalStation() == base && iMinBaseRest > iMinRest ?
				iMinBaseRest : iMinRest;
				//if (pPairing->getDbId() == 1584469)
				//	printf("");
				if (!roster) {
					duty->setMinRest(value);
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, value, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);
				}
				else {
					roster->dutyValues.setMinRest((int)i, value);
				}
			}
		}

	}
}

bool LegalityChecker::checkAdvisorInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	//This rule is NOT defined for RO.
	if (this->_application == ROSTER_OPTIMIZER || pCrew->crewIndex < 0)
		return isValid;

	SharedPtr<CREW>& crew = _dbData->crewList[pCrew->crewIndex];
	bool isFd = (crew->division == "P");

	if (isFd)
	{
		printf("Exception:only support cabin.\n");
		return true;
	}

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() <= 0)
		return true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string pBases, pRanks, pFleets, pRoleA, pMin, pMax, pRoleB, pRatio;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			pBases = headeValue;
		}
		if (header == "RANKS") {
			pRanks = headeValue;
		}
		if (header == "FLEETS") {
			pFleets = headeValue;
		}
		if (header == "ROLE A") {
			pRoleA = headeValue;
		}
		if (header == "ROLE B") {
			pRoleB = headeValue;
		}
		if (header == "A/B REQUIRED RATIO") {
			pRatio = headeValue;
		}
	}
	double dRatio = stod(pRatio);

	map<string, SharedPtr<SwapCrew>>& crews = pCrew->swapData->swapCrews;
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlts = this->getDataContext()->crewOnFlt;

	time_t lCheckedStart = rosters[0]->actStrUtc;
	time_t lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;

	//base/rank/fleet/team
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBases, pRanks, pFleets, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	if (pCrew->swapData)
	{
		for (map<string, SharedPtr<SwapCrew>>::iterator it = crews.begin(); it != crews.end(); ++it)
		{
			if (it->second->swapCrew->idCrew != crew->idCrew)
				continue;

			vector<SharedPtr<ROSTER>>& removeRosters = it->second->removedRosters;
			vector<SharedPtr<ROSTER>>& addedRosters = it->second->addedRosters;

			if (removeRosters.size() >= 1)
			{
				for (auto& roster : removeRosters)
				{
					if (roster->role == "ADV")
					{
						//Advisor is not allowed in SWAP
						isValid = false;
						string errorMsg = "[SWAP] The roster with an advisor is not allowed in roster swaps.";
						setLegalityMessage(crew, pCrew, singleRule, errorMsg);
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crew->idCrew;
						rv->startDTUtc = roster->actStrUtc;
						rv->endDTUtc = roster->actEndUtc;
						rv->violation_msg = errorMsg;
						rv->type = VIOLATION_TYPE::SWAP_VIOLATION;
						this->addRuleViolations(rv, singleRule);
					}
				}
			}
		}
	}
	for (auto& roster : crew->rosterList)
	{
		//0003521: 8084判斷role比例不符時需要在所涉及的role的crew身上告警
		if (roster->role != pRoleA && roster->role != pRoleB)
			continue;

		if (roster->pairing)
		{
			const vector<Duty *>& duties = roster->pairing->getDutyVec();
			for (auto& duty : duties)
			{
				const vector<Segment*>& segments = duty->getSegments();
				for (auto& segment : segments)
				{
					long long flt_id = segment->getDBId();
					if (crewsOnFlts.find(flt_id) != crewsOnFlts.end())
					{
						vector<SharedPtr<CrewOnFlight>>& cofs = crewsOnFlts.find(flt_id)->second;
						int advNum = 0, ojtNum = 0;
						for (auto& cof : cofs)
						{
							if (cof->role == pRoleA)
								advNum++;
							else if (cof->role == pRoleB)
								ojtNum++;
						}
						//20180615 ain, mantis#3473, adv != ojt则警告
						//if (advNum < ojtNum * dRatio)
						if (advNum != ojtNum * dRatio)
						{
							//Advisor is not allowed in SWAP
							isValid = false;
							stringstream ss;
							ss << "The ratio of role A/B(" << pRoleA << "=" << advNum << "," << pRoleB;
							ss << "=" << ojtNum << ") should be at least " << pRatio << " on " <<  segment->getFlightNumber() << ".";
							string errorMsg = ss.str();
							setLegalityMessage(crew, pCrew, singleRule, errorMsg);
							pCrew->isLegal = false;
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->crewId = crew->idCrew;
							rv->startDTUtc = segment->getStartTimeUtcAct();
							rv->endDTUtc = segment->getEndTimeUtcAct();
							rv->violation_msg = errorMsg;
							rv->type = VIOLATION_TYPE::SWAP_VIOLATION;
							//OP#1448提供message参数给gantt
							rv->operation_result.insert(pair<string, string>("pRoleA", pRoleA));
							rv->operation_result.insert(pair<string, string>("advNum", Utility::GetInstancePtr()->iToa(advNum)));
							rv->operation_result.insert(pair<string, string>("pRoleB", pRoleB));
							rv->operation_result.insert(pair<string, string>("ojtNum", Utility::GetInstancePtr()->iToa(ojtNum)));
							rv->operation_result.insert(pair<string, string>("pRatio", pRatio));
							rv->operation_result.insert(pair<string, string>("FlightNumber", segment->getFlightNumber()));
							this->addRuleViolations(rv, singleRule);

						}
					}

				}
			}
		}
	}

	return isValid;
}


//8087
bool LegalityChecker::checkMaxFTInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	//This rule is NOT defined for RO.
	if (this->_application == ROSTER_OPTIMIZER)
		return isValid;

	if (!(pCrew->swapData))
		return true;
	//20180606 ain, mantis#3363, 只对swap目标crew检查8087
	if (pCrew->crewIndex == -1) {
		return true;
	}

	map<string, SharedPtr<SwapCrew>>& crews = pCrew->swapData->swapCrews;

	//20180606 ain, mantis#3363, 只对swap目标crew检查8087
	string checkTargetCrewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	bool foundTarget = false;
	for (auto& it : crews) {
		if (it.first == checkTargetCrewId)
			foundTarget = true;
	}
	if (!foundTarget) {
		return true;
	}

	if (crews.size() != 2)
	{
		printf("8087-Exception: swapCrews size not equal to two. Only support two crews swap case.\n");
		return true;
	}
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string pBases, pRanks, pFleets, pRequired = "0", pBuffer, pMax, pPeriod, pUnit;
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			pBases = headeValue;
		}
		if (header == "RANKS") {
			pRanks = headeValue;
		}
		if (header == "FLEETS") {
			pFleets = headeValue;
		}
		if (header == "MAX FT") {
			pMax = headeValue;
		}
		if (header == "BUFFER") {
			pBuffer = headeValue;
		}
		if (header == "PERIOD") {
			pPeriod = headeValue;
		}
		if (header == "UNIT") {
			pUnit = headeValue;
		}
	}

	int iMax = hhmmToMinutes(pMax.c_str());
	int iBuffer = hhmmToMinutes(pBuffer.c_str());
	int iOffsetMinutes = 0;
	bool isCrewBaseTimeZone;
	string mandayTimeZone = this->_dbData->systemParamMap["CREW_MANDAY_STORE_TIMEZONE"];

	if (mandayTimeZone == "CREW_BASE" || mandayTimeZone == "" || mandayTimeZone == "UTC2")
	{
		isCrewBaseTimeZone = true;
	}
	else
	{
		isCrewBaseTimeZone = false;
		if (mandayTimeZone == "UTC")
		{
			iOffsetMinutes = 0;
		}
		else
		{
			iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(mandayTimeZone);
		}
	}

	for (map<string, SharedPtr<SwapCrew>>::iterator it = crews.begin(); it != crews.end(); ++it)
	{
		SharedPtr<CREW> crew = it->second->swapCrew;

		//20180606 ain, mantis#3363, 只对swap目标crew检查8087
		if (crew->idCrew != checkTargetCrewId) {
			continue;
		}

		bool isFd = (crew->division == "P");

		if (isFd)
		{
			printf("Exception:only support cabin.\n");
			return true;
		}

		vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
		if (rosters.size() < 1)
			return true;

		if (isCrewBaseTimeZone)
		{
			iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(crew->getPrimeBase());
		}

		time_t lCheckedStart = rosters[0]->actStrUtc;
		time_t lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
		lCheckedStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(lCheckedStart, iOffsetMinutes);
		lCheckedEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(lCheckedEnd, iOffsetMinutes) + 24 * 3600;
		map<time_t, time_t> mpRanges = Utility::GetInstancePtr()->getDateRangeFromLong(pUnit, pPeriod, lCheckedStart, lCheckedEnd, weekdayStartFrom, iOffsetMinutes);

		//base/rank/fleet/team
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBases, pRanks, pFleets, "*", "*", lCheckedStart, lCheckedEnd))
			return true;
		vector<SharedPtr<ROSTER>>& addedRosters = it->second->addedRosters;
		vector<SharedPtr<ROSTER>>& removedRosters = it->second->removedRosters;
		double iAddedFT = 0, iRemovedFT = 0;
		//20190418 ain, mantis#5183, 改为栈对象避免leak
		//BasicCalculation* ftCalc = new BasicCalculation(this->_dbData, crew);
		BasicCalculation ftCalc(this->_dbData, crew);
		ftCalc.setRuleEngine(this);
		map<time_t, SharedPtr<CREW_MANDAY_BASIC>> addMandays = ftCalc.calculateManDays(addedRosters, false);
		map<time_t, SharedPtr<CREW_MANDAY_BASIC>> revMandays = ftCalc.calculateManDays(removedRosters, false);

		time_t start = min(addedRosters[0]->actStrUtc, removedRosters[0]->actStrUtc);
		time_t end = max(addedRosters[addedRosters.size() - 1]->actRestStrUtc, removedRosters[removedRosters.size() - 1]->actRestStrUtc);

		double iFt = 0;
		for (auto& mpRange : mpRanges)
		{
			iFt = 0, iAddedFT = 0, iRemovedFT = 0;
			if (!Utility::GetInstancePtr()->isTimeOverlap(mpRange.first, mpRange.second, start, end))
				continue;

			for (auto& manday : addMandays)
			{
				if (manday.second->crewDateUtc <= mpRange.second && manday.second->crewDateUtc >= mpRange.first && manday.second->ft > 0)
					iAddedFT += manday.second->ft;
			}
			for (auto& manday : revMandays)
			{
				if (manday.second->crewDateUtc <= mpRange.second && manday.second->crewDateUtc >= mpRange.first && manday.second->ft > 0)
					iRemovedFT += manday.second->ft;
			}

			//if (crew->idCrew == "306812" && mpRange.first >= 1524412800)
			//	printf("");

			for (auto& cc : crew->mandayCcAmList)
			{
				if (cc->crewDateUtc <= mpRange.second && cc->crewDateUtc >= mpRange.first && cc->ft > 0)
					iFt += cc->ft;

			}
			double iFtBeforeSwap = iFt - iAddedFT + iRemovedFT;

			if (((int)iFtBeforeSwap <= iMax + iBuffer && (int)iFt > iMax + iBuffer) ||
				((int)iFtBeforeSwap > iMax + iBuffer && (int)iFt > iMax + iBuffer && (int)iFt > (int)iFtBeforeSwap))
			{
				string startUtcStr, endUtcStr;
				startUtcStr = utcToUtcDtString(mpRange.first + iOffsetMinutes * 60);
				endUtcStr = utcToUtcDtString(mpRange.second + iOffsetMinutes * 60 + 24 * 3600 - 60);

				string errorMsg = "The crew's flight time before the swap ({0:ftBeforeSwapHHmm}) in the window ({1:startUtcStr} - {2:endUtcStr}), after the swap ({3:ftHHmm}) exceeds the maximum ({4:pMax}), buffer={5:pBufferHHmm}.";
				errorMsg = StringUtils::Format(errorMsg, Utility::GetInstancePtr()->formatMinutes((int)iFtBeforeSwap), startUtcStr, endUtcStr, Utility::GetInstancePtr()->formatMinutes((int)iFt), pMax, pBuffer);

				setLegalityMessage(crew, pCrew, singleRule, errorMsg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->startDTUtc = it->second->addedRosters[0]->actStrUtc;
				rv->endDTUtc = it->second->addedRosters[0]->actEndUtc;
				rv->violation_msg = errorMsg;
				rv->type = VIOLATION_TYPE::SWAP_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iFtBeforeSwap", Utility::GetInstancePtr()->formatMinutes((int)iFtBeforeSwap)));
				rv->operation_result.insert(pair<string, string>("iFt", Utility::GetInstancePtr()->formatMinutes((int)iFt)));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("pMax", pMax));
				rv->operation_result.insert(pair<string, string>("pBuffer", pBuffer));
				this->addRuleViolations(rv, singleRule);
			}
		}
		//delete ftCalc;
	}
	return isValid;
}

//8086
bool LegalityChecker::checkMaxALInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	//This rule is NOT defined for RO.
	/*if (this->_application == ROSTER_OPTIMIZER)
	return isValid;

	if (!(pCrew->swapData))
	return true;

	map<string, SharedPtr<SwapCrew>>& crews = pCrew->swapData->swapCrews;

	if (crews.size() != 2)
	{
	printf("8086-Exception: swapCrews size not equal to two. Only support two crews swap case.\n");
	return true;
	}*/

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string pBases = "*", pRanks = "*", pFleets = "*", pRequired = "0", pType = "DO";

	if (this->GetApplication() == ROSTER_OPTIMIZER)
		return false;

	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			pBases = headeValue;
		}
		if (header == "RANKS") {
			pRanks = headeValue;
		}
		if (header == "FLEETS") {
			pFleets = headeValue;
		}
		if (header == "ENTITLEMENT TYPE") {
			pType = headeValue;
		}
		if (header == "MIN LEFT TYPE") {
			pRequired = headeValue;
		}
	}

	tm temp = { 0 };

	time_t lCheckedStart = 0, lCheckedEnd = 0, checkEnd = 0, checkStart = 0;

	int iRequired = atoi(pRequired.c_str());

	//for (map<string, SharedPtr<SwapCrew>>::iterator it = crews.begin(); it != crews.end(); ++it)
	//{
	if (pCrew->crewIndex < 0){
		return true;
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	bool isFd = (crew->division == "P");

	/*if (isFd)
	{
		printf("Exception:only support cabin.\n");
		return true;
	}*/

	vector<SharedPtr<ROSTER>> rosters = crew->rosterList;
	if (rosters.size() < 1) {
		checkStart = this->_dbData->scenario.startDtUTC;
		checkEnd = this->_dbData->scenario.endDtUTC;
	}
	else {
		checkStart = rosters[0]->actStrUtc;
		checkEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
		
	
	//base/rank/fleet/team
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBases, pRanks, pFleets, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<SharedPtr<CREW_MANDAY_FD>> cfd = crew->mandayFdList;
	vector<SharedPtr<CREW_MANDAY_CC_AM>> cabin = crew->mandayCcAmList;
	vector<SharedPtr<CREW_ENTITLEMENT>>& entitlements = crew->entitlements;
	auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(crew->getPrimeBase());

	double iType = 0.0;
	time_t startLocal = utcToLocal(checkStart);
#ifdef _WIN32
	_gmtime32_s(&temp, (__time32_t *)&startLocal);
#else
	gmtime_r(&startLocal, &temp);
#endif

	temp.tm_mon = 0;
	temp.tm_mday = 1;
	temp.tm_hour = 0;

	time_t yearStart = mktime(&temp);
	int this_year = temp.tm_year + 1900;

	for (auto entitlement : entitlements)
	{
		if (entitlement->year == this_year && entitlement->type == pType &&
			entitlement->expDt >= checkStart && entitlement->effDt <= checkEnd)
		{
			iType = entitlement->entitlement + entitlement->carryOver;
			lCheckedStart = entitlement->effDt;
			lCheckedEnd = entitlement->expDt;

			long iTaken = 0;
			if (crew->division == "P")
			{
				for (auto& fd : crew->mandayFdList)
				{
					if (pType == "DO")
					{
						if (fd->crewDateUtc <= lCheckedEnd && fd->crewDateUtc >= yearStart)
							iTaken += (fd->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
					}
					else if (pType == "AL")
					{
						if (fd->crewDateUtc <= lCheckedEnd && fd->crewDateUtc >= yearStart)
							iTaken += fd->IS_AL;
					}
				}
			}
			else
			{
				for (auto& cc : crew->mandayCcAmList)
				{
					if (pType == "DO")
					{
						if (cc->crewDateUtc <= lCheckedEnd && cc->crewDateUtc >= yearStart)
							iTaken += (cc->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
					}
					else if (pType == "AL")
					{
						if (cc->crewDateUtc <= lCheckedEnd && cc->crewDateUtc >= yearStart)
							iTaken += cc->IS_AL;
					}
				}
			}

			if (iType - iTaken < iRequired)
			{
				isValid = false;
				stringstream ss;

				ss << "The current available annual leave / days off balance (" << iType << " - " << iTaken << ") falls below the minimum required remaining days(" << pRequired << ").";
				string errorMsg = ss.str();
				setLegalityMessage(crew, pCrew, singleRule, errorMsg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->startDTUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(lCheckedStart, iOffsetMinutes);
				rv->endDTUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(lCheckedEnd, iOffsetMinutes);
				rv->violation_msg = errorMsg;
				rv->type = VIOLATION_TYPE::SWAP_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iTaken", Utility::GetInstancePtr()->lToa(iTaken)));
				rv->operation_result.insert(pair<string, string>("pType", pType));
				rv->operation_result.insert(pair<string, string>("iType", Utility::GetInstancePtr()->dToa(iType)));
				rv->operation_result.insert(pair<string, string>("pRequired", pRequired));
				this->addRuleViolations(rv, singleRule);
			}
		}
	}

	return isValid;
}

//8082
bool LegalityChecker::checkDaysOffInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	//This rule is NOT defined for RO.
	if (this->_application == ROSTER_OPTIMIZER)
		return isValid;

	if (!(pCrew->swapData))
	{
		//printf("Exception: rule 8082, No Swap Data.\n"); //editor非swap操作无需警告 'no swap data'
		return true;
	}
	map<string, SharedPtr<SwapCrew>> crews = pCrew->swapData->swapCrews;
	if (crews.size() != 2)
	{
		printf("8082-Exception: swapCrews size not equal to two. Only support two crews swap case.\n");
		return true;
	}

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string pBases, pRanks, pFleets, pMonth, pMin, pMax, pRequired, pType, pBuffer;
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			pBases = headeValue;
		}
		if (header == "RANKS") {
			pRanks = headeValue;
		}
		if (header == "FLEETS") {
			pFleets = headeValue;
		}
		if (header == "MONTH") {
			pMonth = headeValue;
		}
		if (header == "REQUIRED YDO") {
			pRequired = headeValue;
		}
		if (header == "BUFFER") {
			pBuffer = headeValue;
		}
	}

	tm temp = { 0 };

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	map<time_t, time_t>::iterator iter_date;
	int iOffsetMinutes = 0;

	int iRequired = 0, iBuffer = 0, iMonth = 1;
	iRequired = atoi(pRequired.c_str());
	iBuffer = atoi(pBuffer.c_str());
	iMonth = atoi(pMonth.c_str());

	int iCheckMin = 0, iCheckMax = 0;

	map<time_t, time_t> mpRange = Utility::GetInstancePtr()->getDateRangeFromLong("CM", "1", this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600, weekdayStartFrom);
	for (map<string, SharedPtr<SwapCrew>>::iterator it = crews.begin(); it != crews.end(); ++it)
	{
		SharedPtr<CREW> crew = it->second->swapCrew;
		bool isFd = (crew->division == "P");

		if (isFd)
		{
			printf("Exception:only support cabin.\n");
			return true;
		}

		vector<SharedPtr<ROSTER>> rosters = crew->rosterList;
		if (rosters.size() < 1)
			return true;

		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
		//base/rank/fleet/team
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBases, pRanks, pFleets, "*", "*", lCheckedStart, lCheckedEnd))
			return true;
		//int offset = _dbData->getAirportOffset("TPE");
		//if (crew->idCrew == "306033" || crew->idCrew == "102314" || crew->idCrew == "102314")
		//	printf("");

		vector<SharedPtr<CREW_MANDAY_FD>>& cfd = crew->mandayFdList;
		vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;
		vector<SharedPtr<CREW_MANDAY_CC_AM>>& publishedCabin = crew->publishedMandayCcAmList;
		vector<SharedPtr<CREW_ENTITLEMENT>>& entitlements = crew->entitlements;
		iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(crew->getPrimeBase());

		for (iter_date = mpRange.begin(); iter_date != mpRange.end(); ++iter_date)
		{
			iCheckMin = 0, iCheckMax = 0;
			int iYDO = 0;
			time_t startLocal = utcToLocal(iter_date->first);
#ifdef _WIN32
			_gmtime32_s(&temp, (__time32_t *)&startLocal);
#else
			gmtime_r(&startLocal, &temp);
#endif
			int iCurrentMonth = temp.tm_mon + 1; //[0-11]

			if (iMonth != iCurrentMonth)
				continue;

			temp.tm_mon = 0;
			temp.tm_mday = 1;
			temp.tm_hour = 0;

			time_t yearStart = mktime(&temp);
			int this_year = temp.tm_year + 1900;
			/*
			for (auto entitlement : entitlements)
			{
			if (entitlement->year == this_year && entitlement->type == "DO")
			{
			iYDO = ceil(entitlement->entitlement);
			break;
			}
			}*/
			time_t monthStart = iter_date->first;
			time_t monthEnd = iter_date->second;

			long iTakenDO = 0, iCurrentDO = 0, iPubDO = 0;
			if (crew->division == "P")
			{
				for (auto& fd : crew->mandayFdList)
				{
					if (fd->crewDateUtc <= monthEnd && fd->crewDateUtc >= monthStart)
						iCurrentDO += (fd->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
					if (fd->crewDateUtc < monthStart && fd->crewDateUtc >= yearStart)
						iTakenDO += (fd->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
				}
			}
			else
			{
				for (auto& cc : crew->mandayCcAmList)
				{
					if (cc->crewDateUtc <= monthEnd && cc->crewDateUtc >= monthStart)
						iCurrentDO += (cc->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
					if (cc->crewDateUtc < monthStart && cc->crewDateUtc >= yearStart)
						iTakenDO += (cc->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
				}
				for (auto& cc : crew->publishedMandayCcAmList)
				{
					if (cc->crewDateUtc <= monthEnd && cc->crewDateUtc >= monthStart)
						iPubDO += (cc->DAY_OFF == DAY_OFF_EXIST ? 1 : 0);
				}
			}

			iCheckMin = max(min(iRequired, (int)(iPubDO + iTakenDO)) - iBuffer, 0);
			iCheckMax = max(iRequired, (int)(iPubDO + iTakenDO)) + iBuffer;

			if (iCurrentDO + iTakenDO < iCheckMin || iCurrentDO + iTakenDO > iCheckMax)
			{
				char startUtcStr[30] = { 0 };
				char endUtcStr[30] = { 0 };
				Utility::GetInstancePtr()->UTCToUTCStr(iter_date->first + iOffsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
				Utility::GetInstancePtr()->UTCToUTCStr(iter_date->second + iOffsetMinutes * 60 + 24 * 3600 - 1, endUtcStr, sizeof(endUtcStr));

				isValid = false;
				stringstream ss;
				ss << "[SWAP]Crew actual YDO since Jan" << "(" << (iCurrentDO + iTakenDO)
					<< ") should be at least " << iCheckMin << " and no more than "
					<< iCheckMax << ".";
				string errorMsg = "[SWAP] The crew's actual yearly days off (YDO) since January ({0:iCurrentDOAddiTakenDO}) should be at least {1:iCheckMin} and no more than {2:iCheckMax}.";
				errorMsg = StringUtils::Format(errorMsg, (iCurrentDO + iTakenDO), iCheckMin);
				setLegalityMessage(crew, pCrew, singleRule, errorMsg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->startDTUtc = iter_date->first - iOffsetMinutes * 60;
				rv->endDTUtc = iter_date->second + iOffsetMinutes * 60;
				rv->violation_msg = errorMsg;
				rv->type = VIOLATION_TYPE::SWAP_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iCurrentDO", Utility::GetInstancePtr()->lToa(iCurrentDO)));
				rv->operation_result.insert(pair<string, string>("iTakenDO", Utility::GetInstancePtr()->lToa(iTakenDO)));
				rv->operation_result.insert(pair<string, string>("iCheckMin", Utility::GetInstancePtr()->lToa(iCheckMin)));
				rv->operation_result.insert(pair<string, string>("iCheckMax", Utility::GetInstancePtr()->lToa(iCheckMax)));
				this->addRuleViolations(rv, singleRule);
			}
		}
	}

	return isValid;
}

//8081
bool LegalityChecker::checkTimesInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	//This rule is NOT defined for RO.
	if (this->_application == ROSTER_OPTIMIZER)
		return isValid;

	if (!(pCrew->swapData))
	{
		//printf("Exception: rule 8081, No Swap Data.\n"); //editor非swap操作无需警告 'no swap data'
		return true;
	}
	map<string, SharedPtr<SwapCrew>> crews = pCrew->swapData->swapCrews;
	if (crews.size() != 2)
	{
		printf("Exception: swapCrews size not equal to two. Only support two crews swap case.\n");
		return true;
	}

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string pBases, pRanks, pFleets, pUnit, pMin, pMax, pPeriod, pType, pBuffer, strMonth = "*";
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			pBases = headeValue;
		}
		if (header == "NO. MONTH") {
			strMonth = headeValue;
		}
		if (header == "RANKS") {
			pRanks = headeValue;
		}
		if (header == "FLEETS") {
			pFleets = headeValue;
		}
		if (header == "UNIT") {
			pUnit = headeValue;
		}
		if (header == "PERIOD") {
			pPeriod = headeValue;
		}
		if (header == "TYPE") {
			pType = headeValue;
		}
		if (header == "MIN") {
			pMin = headeValue;
		}
		if (header == "MAX") {
			pMax = headeValue;
		}
		if (header == "BUFFER") {
			pBuffer = headeValue;
		}
	}
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	map<time_t, time_t>::iterator iter_date;
	int iOffsetMinutes = 0;
	double iCumFDP = 0, iCumBlh = 0, iCumFt = 0, iCumDP = 0;
	double iPubFdp = 0, iPubBlh = 0, iPubFt = 0, iPubDp = 0;

	int iMonth = 1;
	try
	{
		if (strMonth != "*")
			iMonth = stoi(strMonth);

		if (iMonth > 12)
			iMonth = 12;
	}
	catch (string e)
	{
		printf("[8081]Parsing rule parameters error.\n");
		return true;
	}

	//mantis#2884, MIN/MAX/BUFFER同时支持 HH:mm和 minutes格式
	int iMin = 0, iMax = 999, iBuffer = 0;
	iMin = isHHmm(pMin.c_str()) ? hhmmToMinutes(pMin.c_str()) : atoi(pMin.c_str());
	iMax = isHHmm(pMax.c_str()) ? hhmmToMinutes(pMax.c_str()) : atoi(pMax.c_str());
	iBuffer = isHHmm(pBuffer.c_str()) ? hhmmToMinutes(pBuffer.c_str()) : atoi(pBuffer.c_str());
	int iCheckMin = 0, iCheckMax = 0;

	time_t loopStart;
	tm temp = { 0 };
	time_t startLocal;
	bool isCrewBaseTimeZone;
	string mandayTimeZone = this->_dbData->systemParamMap["CREW_MANDAY_STORE_TIMEZONE"];

	if (mandayTimeZone == "CREW_BASE" || mandayTimeZone == "" || mandayTimeZone == "UTC2")
	{
		isCrewBaseTimeZone = true;
	}
	else
	{
		isCrewBaseTimeZone = false;
		if (mandayTimeZone == "UTC")
		{
			iOffsetMinutes = 0;
		}
		else
		{
			iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(mandayTimeZone);
		}
	}

	auto targetCrew = _dbData->crewList[pCrew->crewIndex];

	map<time_t, time_t> mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(pUnit, pPeriod, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600, weekdayStartFrom);
	for (map<string, SharedPtr<SwapCrew>>::iterator it = crews.begin(); it != crews.end(); ++it)
	{
		SharedPtr<CREW> crew = it->second->swapCrew;
		bool isFd = (crew->division == "P");

		if (isFd)
		{
			printf("Exception: rule 8081 only support cabin.\n");
			return true;
		}
		//20190208 ain, mantis#4925, 8081, 避免重复检查, 避免 outbox/中crewA段落输出 crewB违规
		if (targetCrew && crew->idCrew != targetCrew->idCrew) {
			continue;
		}

		vector<SharedPtr<ROSTER>> rosters = crew->rosterList;
		if (rosters.size() < 1)
			return true;

		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;

		vector<SharedPtr<CREW_MANDAY_FD>>& cfd = crew->mandayFdList;
		vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;
		vector<SharedPtr<CREW_MANDAY_CC_AM>>& publishedCabin = crew->publishedMandayCcAmList;

		if (isCrewBaseTimeZone)
		{
			iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(crew->getPrimeBase());
		}

		if (isFd)
			stable_sort(cfd.begin(), cfd.end(), cmpFD);
		else
		{
			stable_sort(cabin.begin(), cabin.end(), cmpCC);
			stable_sort(publishedCabin.begin(), publishedCabin.end(), cmpCC);
		}

		//base/rank/fleet/team
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBases, pRanks, pFleets, "*", "*", lCheckedStart, lCheckedEnd))
			return true;

		//20180319 ain, mantis#2982, 时间筛选区间改为左开右闭：mday.dt>= window.start && mday.dt < window.end
		for (iter_date = mpRange.begin(); iter_date != mpRange.end(); ++iter_date)
		{
			//op1434,只在当前月份显示
			bool isOverlap = false;
			for (auto roster : it->second->addedRosters){
				if (Utility::GetInstancePtr()->isTimeOverlap(iter_date->first, iter_date->second, roster->actStrUtc, roster->actRestStrUtc)){
					isOverlap = true;
					break;
				}
			}
			if (!isOverlap)continue;
			//op1434,增加MONTH参数
			//for safe, add two days
			if (strMonth != "*")
			{
				loopStart = iter_date->first + 2 * 24 * 3600;
				startLocal = utcToLocal(loopStart);
#ifdef _WIN32
				_gmtime32_s(&temp, (__time32_t *)&startLocal);
#else
				gmtime_r(&startLocal, &temp);
#endif

				if (temp.tm_mon + 1 != iMonth)
					continue;
			}

			iCumFDP = 0, iCumBlh = 0, iCumFt = 0, iCumDP = 0;
			iPubFdp = 0, iPubBlh = 0, iPubFt = 0, iPubDp = 0;
			iCheckMin = 0, iCheckMax = 0;
			if (isFd)
			{
				for (size_t j = 0; j < cfd.size(); j++)
				{
					if (cfd[j]->crewDateUtc >= (iter_date->first - iOffsetMinutes * 60) && cfd[j]->crewDateUtc < iter_date->second + 24 * 3600)
					{
						iCumFt += cfd[j]->ft;
						iCumFDP += cfd[j]->fdp;
						iCumDP += cfd[j]->dp;
						iCumBlh += cfd[j]->blh;
					}
				}
			}
			else
			{
				for (size_t j = 0; j < cabin.size(); j++)
				{
					if (cabin[j]->crewDateUtc >= (iter_date->first - iOffsetMinutes * 60) && cabin[j]->crewDateUtc < iter_date->second + 24 * 3600)
					{
						iCumFt += cabin[j]->ft;
						iCumFDP += cabin[j]->fdp;
						iCumDP += cabin[j]->dp;
						iCumBlh += cabin[j]->blh;
					}
				}
				for (size_t j = 0; j < publishedCabin.size(); j++)
				{
					if (publishedCabin[j]->crewDateUtc >= (iter_date->first - iOffsetMinutes * 60) && publishedCabin[j]->crewDateUtc < iter_date->second + 24 * 3600)
					{
						iPubFt += publishedCabin[j]->ft;
						iPubFdp += publishedCabin[j]->fdp;
						iPubDp += publishedCabin[j]->dp;
						iPubBlh += publishedCabin[j]->blh;
					}
				}
			}

			//
			double iType = 0, iTypeActual = 0;
			if (pType == "FDP")
			{
				iType = iPubFdp;
				iTypeActual = iCumFDP;
			}
			else if (pType == "BH")
			{
				iType = iPubBlh;
				iTypeActual = iCumBlh;
			}
			else if (pType == "FT")
			{
				iType = iPubFt;
				iTypeActual = iCumFt;
			}
			else if (pType == "DP")
			{
				iType = iPubDp;
				iTypeActual = iCumDP;
			}
			if ((int)iType < iMin)
			{
				iCheckMin = (int)iType - iBuffer;
				iCheckMax = (iMax + iBuffer);
			}
			else if ((int)iType > iMax)
			{
				iCheckMin = (iMin - iBuffer);
				iCheckMax = (int)iType + iBuffer;
			}
			else
			{
				iCheckMin = (iMin - iBuffer);
				iCheckMax = (iMax + iBuffer);
			}
			if ((int)iTypeActual < iCheckMin || (int)iTypeActual > iCheckMax)
			{
				char startUtcStr[30] = { 0 };
				char endUtcStr[30] = { 0 };
				Utility::GetInstancePtr()->UTCToUTCStr(iter_date->first + (time_t)iOffsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
				Utility::GetInstancePtr()->UTCToUTCStr(iter_date->second + (time_t)iOffsetMinutes * 60 + 24 * 3600 - 1, endUtcStr, sizeof(endUtcStr));

				isValid = false;
				string errorMsg = "[SWAP] The crew's actual {0:pType} ({1:typeActualHHmm}) in the current window [UTC: {2:startUtcStr} - {3:endUtcStr}] should be at least {4:checkMinHHmm} and no more than {5:iCheckMax}.";
				errorMsg = StringUtils::Format(errorMsg, pType, Utility::GetInstancePtr()->formatMinutes((int)iTypeActual),
					startUtcStr, endUtcStr, Utility::GetInstancePtr()->formatMinutes(iCheckMin), Utility::GetInstancePtr()->formatMinutes((int)iCheckMax));

				setLegalityMessage(crew, pCrew, singleRule, errorMsg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->startDTUtc = iter_date->first - (time_t)iOffsetMinutes * 60;
				rv->endDTUtc = iter_date->second + (time_t)iOffsetMinutes * 60;
				rv->violation_msg = errorMsg;
				rv->type = VIOLATION_TYPE::SWAP_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("pType", pType));
				rv->operation_result.insert(pair<string, string>("pPeriod", pPeriod));
				rv->operation_result.insert(pair<string, string>("pUnit", pUnit));
				rv->operation_result.insert(pair<string, string>("iTypeActual", Utility::GetInstancePtr()->formatMinutes((int)iTypeActual)));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("iCheckMin", Utility::GetInstancePtr()->formatMinutes(iCheckMin)));
				rv->operation_result.insert(pair<string, string>("iCheckMax", Utility::GetInstancePtr()->formatMinutes(iCheckMax)));
				this->addRuleViolations(rv, singleRule);
			}
		}
	}

	return isValid;
}

//8079
bool LegalityChecker::checkMonthlyAssignments(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string rBase = "*", rRank = "*", rFleet = "*", rTeam = "*";
	string strMonth = "*", strAssignmentGroups = "*", strMin = "0", strMax = "9999";
	bool bCountBlank = false, bCountPostRest = false, bCountLayover = false;

	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		//bases\ranks\fleets\crew teams\count layover
		if (header == "BASES") {
			rBase = headeValue;
		}
		if (header == "RANKS") {
			rRank = headeValue;
		}
		if (header == "FLEETS") {
			rFleet = headeValue;
		}
		if (header == "CREW TEAMS") {
			rTeam = headeValue;
		}

		if (header == "NO. MONTH") {
			strMonth = headeValue;
		}
		if (header == "ASSIGNMENT GROUP") {
			strAssignmentGroups = headeValue;
		}
		if (header == "MIN") {
			strMin = headeValue;
		}
		if (header == "MAX") {
			strMax = headeValue;
		}
		if (header == "COUNT BLANK DAY") {
			bCountBlank = (headeValue == "Y");
		}
		if (header == "POST DUTY REST") {
			bCountPostRest = (headeValue == "Y");
		}
		if (header == "COUNT LAYOVER") {
			bCountLayover = (headeValue == "Y");
		}
	}

	int iMonth = 1, iMin = 0, iMax = 999;
	try
	{
		if (strMonth != "*")
			iMonth = stoi(strMonth);
		iMin = stoi(strMin);
		iMax = stoi(strMax);

		if (iMonth > 12)
			iMonth = 12;
	}
	catch (string e)
	{
		Logger::getRuleLogger()->error("[8079]Parsing rule parameters error.");
		return true;
	}

	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	lCheckedStart = this->_dbData->scenario.startDtUTC;
	lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, rBase, rRank, rFleet, rTeam, "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<SharedPtr<CREW_MANDAY_FD>> fdMandays;
	vector<SharedPtr<CREW_MANDAY_CC_AM>> ccMandays;
	vector<SharedPtr<CREW_ENTITLEMENT>>& entitlements = crew->entitlements;

	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, this->_dbData->scenario.startDtUTC);
	auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	vector<string> doAssignments;
	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
	{
		if ((*assignment)->assignmentGroup == strAssignmentGroups && (this->_dbData->version == 3 || (*assignment)->airline == this->_dbData->scenario.airline))
		{
			doAssignments.push_back((*assignment)->assignemnt);
		}
	}
	map<time_t, time_t> mps = Utility::GetInstancePtr()->getMonthRollingWindows(lCheckedStart, lCheckedEnd, offsetMinutes, 1);

	//if (crew->idCrew == "151414" && iMonth==4)
	//	printf("");

	time_t loopStart = 0;
	tm temp = { 0 };
	time_t startLocal = 0;
	for (const auto& mp : mps)
	{
		if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, rTeam, mp.first, mp.second))
			continue;
		//for safe, add two days
		if (strMonth != "*")
		{
			loopStart = mp.first + 2 * 24 * 3600;

			startLocal = utcToLocal(loopStart);
#ifdef _WIN32
			_gmtime32_s(&temp, (__time32_t *)&startLocal);
#else
			gmtime_r(&startLocal, &temp);
#endif

			if (temp.tm_mon + 1 != iMonth)
				continue;
		}
		int iCurrentDO = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, doAssignments, mp.first, mp.second, offsetMinutes, bCountBlank, bCountPostRest, this->_dbData->airportCodeMap, "", 1, bCountLayover, base, true);

		if ((iCurrentDO<iMin) || (iCurrentDO > iMax))
		{
			char startUtcStr[30] = { 0 };
			char endUtcStr[30] = { 0 };
			Utility::GetInstancePtr()->UTCToUTCStr(mp.first + offsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
			Utility::GetInstancePtr()->UTCToUTCStr(mp.second + offsetMinutes * 60 - 1, endUtcStr, sizeof(endUtcStr));

			isValid = false;
			string errorMsg = "The crew's actual days off ({0:iCurrentDO}) in the current month [UTC: {1:startUtcStr} - {2:endUtcStr}] should be at least {3:iMin} and no more than {4:iMax}.";
			errorMsg = StringUtils::Format(errorMsg, iCurrentDO, startUtcStr, endUtcStr, iMin, iMax);

			setLegalityMessage(crew, pCrew, singleRule, errorMsg);
			pCrew->isLegal = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crew->idCrew;
			rv->startDTUtc = mp.first;
			rv->endDTUtc = mp.second - 1;
			rv->violation_msg = errorMsg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("iCurrentDO", Utility::GetInstancePtr()->iToa(iCurrentDO)));
			rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
			rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
			rv->operation_result.insert(pair<string, string>("iMin", Utility::GetInstancePtr()->iToa(iMin)));
			rv->operation_result.insert(pair<string, string>("iMax", Utility::GetInstancePtr()->iToa(iMax)));
			this->addRuleViolations(rv, singleRule);
		}
	}
	return isValid;
}

//检查给定station是否是allowLayover
bool LegalityChecker::checkLayoverStation(string stationName)
{
	bool isLayoverStation = true;

	vector<string>& noLayovers = RuleParams::GetInstancePtr()->noLayovers;
	vector<string>& allowLayovers = RuleParams::GetInstancePtr()->allowLayovers;

	if ((std::find(noLayovers.begin(), noLayovers.end(), stationName) != noLayovers.end()) ||
		((std::find(allowLayovers.begin(), allowLayovers.end(), stationName) == allowLayovers.end()) && (RuleParams::GetInstancePtr()->restrictAllAirportInLayover == "Y")))
	{
		isLayoverStation = false;
	}

	return isLayoverStation;
}

//检查给定station是否是allowLongTransit
bool LegalityChecker::checkLongTransitStation(string stationName)
{
	bool isLongTransitStation = true;

	vector<string>& noLongTransits = RuleParams::GetInstancePtr()->noLongTransits;
	vector<string>& allowLongTransits = RuleParams::GetInstancePtr()->allowLongTransits;

	if ((std::find(noLongTransits.begin(), noLongTransits.end(), stationName) != noLongTransits.end()) ||
		((std::find(allowLongTransits.begin(), allowLongTransits.end(), stationName) == allowLongTransits.end()) && (RuleParams::GetInstancePtr()->restrictAllAirportInLongTransit == "Y")))
		isLongTransitStation = false;

	return isLongTransitStation;
}

//检查给定station是否是allowACChange
bool LegalityChecker::checkAircraftChangeStation(string stationName)
{
	bool isAircraftChangeStation = true;

	vector<string>& noACChanges = RuleParams::GetInstancePtr()->noACChanges;
	vector<string>& allowACChanges = RuleParams::GetInstancePtr()->allowACChanges;


	if ((std::find(noACChanges.begin(), noACChanges.end(), stationName) != noACChanges.end()) ||
		((std::find(allowACChanges.begin(), allowACChanges.end(), stationName) == allowACChanges.end()) && (RuleParams::GetInstancePtr()->restrictAllAirportInACChange == "Y")))
		isAircraftChangeStation = false;

	return isAircraftChangeStation;
}

/*
需保证在 delRoster生效前调用，以便判断 rosters[index]和 rosters[index+1]之前重叠关系
解决Call in Standby被deassign时候，MIN REST无法被重置问题
因为CALL IN STANDBY被deassign后，MIN REST变小，而MIN REST缺省逻辑阻止小于当前MIN REST的设置
STANDBY被落下后，后一段ROSTER的pairing里各个DUTY的MIN REST/FDP都重置为0，然后再调用CHECKRULE
重新设置MIN RESTresetRoseter
0004076: 8080 消除RB+FLY重叠之后MRT重算的例子
mantis#5194：1 只在当前RB、且后续FLY/MVO/MVP时重算 fdp/rest；
2 且前后存在时间段重叠时，才重置nextRoster.minRest;
3 重置不再赋值为0，而是按 pairing.duty fdp/rest
*/
void LegalityChecker::resetRoseter(int rosterIndex, SharedPtr<CREW> crew)
{
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosterIndex < 0 || rosterIndex >= (int)crew->rosterList.size())
		return;
	if (rosters[rosterIndex]->duty != "RB")
		return;
	if (rosterIndex == rosters.size() - 1)
		return;
	auto& roster = crew->rosterList[rosterIndex];
	auto& nextRoster = crew->rosterList[rosterIndex + 1];
	//20190410 ain, mantis#5194, 
	//1 只在当前RB、且后续FLY/MVO/MVP时重算 fdp/rest
	//2 且前后存在时间段重叠时，才重置nextRoster.minRest
	//3 重置不再赋值为0，而是按 pairing.duty fdp/rest
	if (roster->duty != "FLY" && roster->duty != "MVO" && roster->duty != "MVP") {
		return;//not fly/mvo/mvp
	}
	if (roster->actStrUtc > nextRoster->actEndUtc || roster->actEndUtc < nextRoster->actStrUtc) {
		return;//not overlap
	}
	if (nextRoster->pairing)	{
		Pairing* pairing = rosters[rosterIndex + 1]->pairing;
		for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
			Duty* duty = pairing->getDuty(i);
			nextRoster->dutyValues.setActFdp((int)i, duty->getPlanFDP());
			nextRoster->dutyValues.setMinRest((int)i, duty->getMinRest());
		}
	}
}

void LegalityChecker::updatePairing(std::shared_ptr<CREW> crew, std::shared_ptr<ROSTER> roster, Pairing* oldPairing) {
	if (oldPairing != nullptr) {
		//7321 TASK_ONLY_OPERATED_FILTERED_CREW_FOR_PR 移除缓存
		removeTaskOnlyBeOperatedByFilteredCrewCacheForPR(crew, roster, oldPairing);
	}
}

void LegalityChecker::resetPairing(std::shared_ptr<CREW> crew, std::shared_ptr<ROSTER> roster, Pairing* newPairing) {
	//7321 TASK_ONLY_OPERATED_FILTERED_CREW_FOR_PR 更新缓存
	updateTaskOnlyBeOperatedByFilteredCrewCacheForPR(crew, roster);
}

bool LegalityChecker::checkLayoverRest(vector<Duty *>& duties, const vector<DBRule>& rules)
{
	bool isValid = true;


	string strBases = "*", strAirports = "*", strMinRest = "00:00", strMinLocalNights = "0", strMaxRest = "999:00", strMaxLocalNights = "99", base;
	string header, headeValue;
	Local_Night_Definition local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	for (auto& rule : rules)
	{
		if (rule.function != RULES::LAYOVER_REST)
			continue;
		auto& parameter = rule.params;
		for (map<string, string>::const_iterator iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "BASES")
				strBases = headeValue;
			if (header == "AIRPORTS")
				strAirports = headeValue;
			if (header == "MIN REST HOURS")
				strMinRest = headeValue;
			if (header == "MAX REST HOURS")
				strMaxRest = headeValue;
			if (header == "MIN LOCAL NIGHTS")
				strMinLocalNights = headeValue;
			if (header == "MAX LOCAL NIGHTS")
				strMaxLocalNights = headeValue;
		}
		std::vector<string> bases, airports;
		split(strBases, '|', bases);
//		boost::split(bases, strBases, boost::is_any_of("|"), boost::token_compress_on);
		//mantis 4222 duty在Pairing生成前没base属性,若想获取Pairing的base应该返回duty[0]的始发机场
		//base = duties[0]->getBase();
		base = duties[0]->getDepStation();
		if (strBases != "*")
			if (std::find(bases.begin(), bases.end(), base) == bases.end())
				continue;
		split(strAirports, '|', airports);
//		boost::split(airports, strAirports, boost::is_any_of("|"), boost::token_compress_on);

		int minRest = hhmmToMinutes(strMinRest.c_str());
		int maxRest = hhmmToMinutes(strMaxRest.c_str());

		for (int i = 0; i < (int)duties.size(); ++i)
		{
			if (!PhaseUtils::IsChecked(duties[i], rule.phase, this->_dbData)) {
				continue;
			}
			
			string arr = duties[i]->getArrStation();
			if (strAirports != "*")
				if (std::find(airports.begin(), airports.end(), arr) == airports.end())
					continue;

			duties[i]->setMinRest(minRest);
			duties[i]->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, rule.idRule, rule.idRuleParam, rule.overridebility, rule.classType, rule.description, rule.reference);
			if (i == duties.size() - 1) break;

			int pickup = duties[i + 1]->getActualPickupMin();
			int dropoff = duties[i]->getActualDropoffMin();
			if (pickup <= 0)
				pickup = duties[i + 1]->getMinPickup();
			if (dropoff <= 0)
				dropoff = duties[i]->getMinDropoff();

			time_t start = duties[i]->getEndTimeUtcAct() + dropoff * 60;
			time_t end = duties[i + 1]->getStartTimeUtcAct() - pickup * 60;

			int actRest = static_cast<int>(end - start) / 60;

			if (actRest < minRest)
			{
				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;

				isValid = false;
				string msg = "Rest(" + Utility::GetInstancePtr()->formatMinutes(actRest) + ") at layover station(" + arr + ") is less than minimum(";
				msg += strMinRest + ") minutes.";
				duties[i]->setViolationMessage(msg);
				duties[i]->setLegality(false);

				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duties[i]->getPairingId();
				rv->dutySequenceNumber = duties[i]->getDutySegNum();
				rv->idRule = rule.idRule;
				rv->startDTUtc = duties[i]->getStartTimeUtcAct();
				rv->endDTUtc = duties[i]->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				rv->violation_msg = msg;
				this->addRuleViolations(rv, &rule);
			}
			if (actRest > maxRest)
			{
				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;

				isValid = false;
				string msg = "Rest(" + Utility::GetInstancePtr()->formatMinutes(actRest) + ") at layover station(" + arr + ") is more than maximum(";
				msg += strMaxRest + ") minutes.";
				duties[i]->setViolationMessage(msg);
				duties[i]->setLegality(false);

				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duties[i]->getPairingId();
				rv->dutySequenceNumber = duties[i]->getDutySegNum();
				rv->idRule = rule.idRule;
				rv->startDTUtc = duties[i]->getStartTimeUtcAct();
				rv->endDTUtc = duties[i]->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				rv->violation_msg = msg;
				this->addRuleViolations(rv, &rule);
			}
			int maxLocalNighs = stoi(strMaxLocalNights);
			int minLocalNighs = stoi(strMinLocalNights);
			auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(arr);
			int numberOfLocalNighs = Utility::GetInstancePtr()->howManyLocalNightsInRest(start, end, maxLocalNighs + 2, local_night, offsetMinutes);
			if (numberOfLocalNighs < minLocalNighs)
			{
				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;

				isValid = false;
				string msg = "The number of local night at layover station(" + arr + ") is less than minimum(";
				msg += strMinLocalNights + ") nights.";
				duties[i]->setViolationMessage(msg);
				duties[i]->setLegality(false);

				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duties[i]->getPairingId();
				rv->dutySequenceNumber = duties[i]->getDutySegNum();
				rv->idRule = rule.idRule;
				rv->startDTUtc = duties[i]->getStartTimeUtcAct();
				rv->endDTUtc = duties[i]->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				rv->violation_msg = msg;
				this->addRuleViolations(rv, &rule);

			}
			if (numberOfLocalNighs > maxLocalNighs)
			{
				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;

				isValid = false;
				string msg = "The number of local night at layover station(" + arr + ") is more than maximum(";
				msg += strMaxLocalNights + ") nights.";
				duties[i]->setViolationMessage(msg);
				duties[i]->setLegality(false);

				if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
					return false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duties[i]->getPairingId();
				rv->dutySequenceNumber = duties[i]->getDutySegNum();
				rv->idRule = rule.idRule;
				rv->startDTUtc = duties[i]->getStartTimeUtcAct();
				rv->endDTUtc = duties[i]->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				rv->violation_msg = msg;
				this->addRuleViolations(rv, &rule);
			}
		}

	}

	return isValid;
}


/*
暂时设定为EVA独有需求
EVA CR24
*/
void LegalityChecker::resetMinRestForOverlapRosters(SharedPtr<CREW> crew)
{
	if (this->_dbData->scenario.airline != "BR")
		return;
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return;
	//if (crew->idCrew == "764968")
	//	printf("");
	for (std::size_t i = 0; i + 1 < rosters.size(); i++)
	{
		//假设仅仅有两两重叠的例子
		if (rosters[i]->pairing && rosters[i + 1]->pairing &&
			Utility::GetInstancePtr()->isTimeOverlap(rosters[i]->actStrUtc, rosters[i]->actEndUtc, rosters[i + 1]->actStrUtc, rosters[i + 1]->actRestStrUtc))
		{
			//if (!(_dbData->isAssignmentInGroup(rosters[i]->qualifier, "CSB")))
			//	continue;
			const vector<Duty *>& duties = rosters[i]->pairing->getDutyVec();
			const vector<Duty *>& nextDuties = rosters[i + 1]->pairing->getDutyVec();
			int lastDutyIndex = (int)duties.size() - 1;
			int nextLastDutyIndex = (int)nextDuties.size() - 1;

			if (lastDutyIndex >= 0 && nextLastDutyIndex >= 0)
			{
				int iCurrentMinRest = max(rosters[i]->dutyValues.getMinRest(lastDutyIndex), duties[lastDutyIndex]->getMinRest());
				int iRestRest = max(rosters[i + 1]->dutyValues.getMinRest(nextLastDutyIndex), nextDuties[nextLastDutyIndex]->getMinRest());
				iRestRest = max(iCurrentMinRest, iRestRest);
				rosters[i + 1]->dutyValues.setMinRest(nextLastDutyIndex, iRestRest);
			}
		}
	}
}


bool LegalityChecker::checkCrewRosterChangeRules(RULE_LEGALITY* pCrew){
	bool isLegal = true;
	DBRule singleRule;
	clock_t lapsed, lpased2;
	for (std::size_t iRule = 0; iRule < this->getDataContext()->ruleList.size(); iRule++) {
		//check every singel rule
		singleRule = this->getDataContext()->ruleList[iRule];
		switch (singleRule.function)
		{
		case RULES::ROSTERS_DIRECT_CONNECTION_LIMITATION:{
			lapsed = clock();
			if ((isLegal) || (this->GetApplication() != ROSTER_OPTIMIZER))
				isLegal = this->checkRosterConnByLableAndAtt(pCrew, &singleRule);
			lpased2 = clock();
			RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
			RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
			if (_debug)
				printf("check roster direct connection limitation rules.\n");
			break;
		}
														 /*	case RULES::EXPAT_CREW_COMBINATION_RESTRICTION:{
														 lapsed = clock();
														 if ((isLegal) || (this->GetApplication() != ROSTER_OPTIMIZER))
														 isLegal = this->checkExpatCrewCombinationRestriction(pCrew, &singleRule);
														 lpased2 = clock();
														 RuleStatistics::GetInstancePtr()->addRuleCallClock(singleRule.idRule, (lpased2 - lapsed));
														 RuleStatistics::GetInstancePtr()->addRuleCallTimes(singleRule.idRule, 1);
														 if (_debug)
														 printf("check expat crew combination restriction rules.\n");
														 break;
														 }*/
		default:
			break;
		}

	}

	return isLegal;
}


void LegalityChecker::resetPairingDutySegTimeByFlight(SharedPtr<CrewDataContext>& dbData, vector<SharedPtr<Segment>>& flights, vector<Pairing*>& pairings) {
	map<long long, SharedPtr<Segment>> fltIdMap;
	for (SharedPtr<Segment> f : flights) {
		fltIdMap[f->getDBId()] = f;
	}
	for (Pairing* p : pairings) {
		if (dbData->pairingIdMap.find(p->getDbId()) == dbData->pairingIdMap.end()) {
			continue;
		}
		string pairingBase = p->getBase();
		if (this->_application == PAIRING_OPTIMIZER && p->getFirstDuty() != nullptr) {
			pairingBase = p->getFirstDuty()->getDepStationRead(); // PO can't get pairing from either duty or segments
		}

		vector<long long> changeSchStartFLtId;
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			Duty* beforeDuty = (i == 0) ? nullptr : p->getDuty(i - 1);
			Duty* nextDuty = ((i + 1) >= p->getNumDuties()) ? nullptr : p->getDuty(i + 1);

			int historyBlkMinutes = 0;
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				Segment* flt = (fltIdMap.find(s->getDBId()) == fltIdMap.end()) ? NULL : fltIdMap[s->getDBId()].get();
				historyBlkMinutes += (flt && flt->getBlkMinHistory() > 0)
					? fltIdMap[s->getDBId()]->getBlkMinHistory()
					: static_cast<int>(s->getEndTimeUtcAct() - s->getStartTimeUtcAct()) / 60;

				if (fltIdMap.find(s->getDBId()) == fltIdMap.end())
					continue;
				if (flt->getStartTimeUtcSch() != s->getStartTimeUtcSch() || s->getIsReCalulateBrief()){
					s->setIsReCalulateBrief(false);
					changeSchStartFLtId.push_back(s->getSegmentId());
					this->setDutyBrief(d, pairingBase);
					this->setDutyPickup(d, pairingBase, beforeDuty, nextDuty);
				}
				s->setStartTimeUtcSch(flt->getStartTimeUtcSch());
				s->setStartTimeLocSch(flt->getStartTimeLocSch());
				s->setEndTimeUtcSch(flt->getEndTimeUtcSch());
				s->setEndTimeLocSch(flt->getEndTimeLocSch());
				s->setStartTimeUtcAct(flt->getStartTimeUtcAct());
				s->setStartTimeLocAct(flt->getStartTimeLocAct());
				s->setEndTimeUtcAct(flt->getEndTimeUtcAct());
				s->setEndTimeLocAct(flt->getEndTimeLocAct());

				//20190222 ain, OP#1840, airport变更
				s->setDepStation(flt->getDepStation());
				s->setArrStation(flt->getArrStation());

				//20250215 airline变更
				s->setAirline(flt->getAirline());

				//20190606 ain, mantis#5892, seg.fleet
				s->setFleetCD(flt->getFleetCD());
				s->setSubFleet(flt->getSubFleet());
				s->setFlightNumber(flt->getFlightNumber());
				RuleParams::GetInstancePtr()->calculateSegPickUpAndDropOff(s, &dbData->airportList);
				if (s->getSplitDutyPickUpMin() != 0 && s->getSplitDutyDropOffMin() != 0 ) {
					d->setSpiltDutyPickUpMin(s->getSplitDutyPickUpMin());
					d->setSpiltDutyDropOffMin(s->getSplitDutyDropOffMin());
				}
			}

			//mantis#6741, 问题6, 按flt变化校正 brief/debrief/drop
			resetDutyNodeTime(dbData, d, changeSchStartFLtId, pairingBase, beforeDuty, nextDuty);
			d->setFlyHoursHistory(historyBlkMinutes / 60.0);
			//mantis#5799 根据 duty和首seg时间确定brief
			if (find(changeSchStartFLtId.begin(), changeSchStartFLtId.end(), d->getFirstSegment()->getSegmentId()) == changeSchStartFLtId.end()){
				auto brief = d->getFirstBreif();
				if (brief != nullptr && !(dbData->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" || brief->getIsManualModify() == 0 || d->getBriefNeedRuleReCalc())) {
					//若手工修改brief，则不能采用计算brief时间，恢复原breif时间
					CalculationManday ACT_FDP = dbData->getCalculationManday("ACT FDP");
					d->calculateBrief(ACT_FDP.str);
				}
			}
			Segment* first = d->getFirstSegment();
			if (first) {
				//mantis#5799 不应该根据ACTUTC计算结果更新sch时间
				d->setDepartureStation(first->getDepStation());//OP#1840, airport变更触发重算 brief
				shared_ptr<PairingDutyNode> brief = Utility::GetInstancePtr()->getPairingDutyNode(d->pairingDutyNodes, "DUTY", "BRIEF");
				if (brief){
					d->setStartTimeUtcAct(brief->getStartUtc());
					d->setStartTimeLocAct(brief->getStartLoc());
					if (find(changeSchStartFLtId.begin(), changeSchStartFLtId.end(), d->getFirstSegment()->getSegmentId()) != changeSchStartFLtId.end()) {
						const auto briefMin = brief->getEndUtc() - brief->getStartUtc();
						d->setStartTimeUtcSch(first->getStartTimeUtcSch() - briefMin);
						d->setStartTimeLocSch(first->getStartTimeLocSch() - briefMin);
						d->setStartTimeUtcAct(first->getStartTimeUtcAct() - briefMin);
						d->setStartTimeLocAct(first->getStartTimeLocAct() - briefMin);
					}
				}


			}
			Segment* last = d->getLastSegment();
			if (last) {
				shared_ptr<PairingDutyNode> debrief = Utility::GetInstancePtr()->getPairingDutyNode(d->pairingDutyNodes, "DUTY", "DEBRIEF");
				const auto debriefMin = debrief->getEndUtc() - debrief->getStartUtc();
				d->setEndTimeUtcSch(last->getEndTimeUtcSch() + debriefMin);
				d->setEndTimeLocSch(last->getEndTimeLocSch() + debriefMin);
				d->setEndTimeUtcAct(last->getEndTimeUtcAct() + debriefMin);
				d->setEndTimeLocAct(last->getEndTimeLocAct() + debriefMin);
				d->setArrivalStation(last->getArrStation());//OP#1840, airport变更触发重算 debrief
			}
			//OP#2246, 酒店流程, 按首尾 seg.pick/drop更新 duty.pick/drop, 若 seg.pick/drop == 0则忽略
			//if (first && d->isSplitDuty() && first->getSplitDutyPickUpMin() > 0) {
			//	d->setActualPickupMin(first->getSplitDutyPickUpMin());
			//}
			//if (last && d->isSplitDuty() && last->getSplitDutyDropOffMin() > 0) {
			//	d->setActualDropoffMin(last->getSplitDutyDropOffMin());
			//}
		}
		if (p->getNumDuties() > 0) {
			Duty* first = p->getDuty(0);
			Duty* last = p->getDuty(p->getNumDuties() - 1);
			shared_ptr<PairingDutyNode> pickup = first->getFirstPickup();
			shared_ptr<PairingDutyNode> dropoff = last->getLastDropoff();
			
			//20200810 ain, mantis#8551, 按pickup/dropoff赋值 ptn.act_start/end
			//20200818 ain, mantis#8551, 增加逻辑，无dutyNode则按duty时间刷新ptn，如SIMS
			Segment* firstSegment = first->getFirstSegment();
			Segment* lastSegment = last->getLastSegment();
			p->setStartTimeUtcSch(firstSegment->getStartTimeUtcSch() - first->getMinBrief() * 60 - first->getMinPickup() * 60);
			p->setStartTimeLocSch(firstSegment->getStartTimeLocSch() - first->getMinBrief() * 60 - first->getMinPickup() * 60);
			p->setStartTimeUtcAct(pickup ? pickup->getStartUtc() : first->getStartTimeUtcAct());
			p->setStartTimeLocAct(pickup ? pickup->getStartLoc() : first->getStartTimeLocAct());
			p->setEndTimeUtcSch(lastSegment->getEndTimeUtcSch() + last->getMinDebrief() * 60 + last->getMinDropoff() * 60);
			p->setEndTimeLocSch(lastSegment->getEndTimeLocSch() + last->getMinDebrief() * 60 + last->getMinDropoff() * 60);
			p->setEndTimeUtcAct(dropoff ? dropoff->getEndUtc() : last->getEndTimeUtcAct());
			p->setEndTimeLocAct(dropoff ? dropoff->getEndLoc() : last->getEndTimeLocAct());
		}
	}
}



void LegalityChecker::completePairingDutySegTimeByFlight(SharedPtr<CrewDataContext>& dbData, vector<Pairing*>& pairings){
	map<long long, SharedPtr<Segment>> fltIdMap;
	//20200509 ain
	if (pairings.size() == 0) {
		return;
	}
	for (SharedPtr<Segment> f : dbData->flightList) {
		fltIdMap[f->getDBId()] = f;
	}
	if (pairings[0]->getStartTimeLocSch() > 0)return;
	for (Pairing* p : pairings) {
		string pairingBase = p->getBase();
		if (this->_application == PAIRING_OPTIMIZER && p->getFirstDuty() != nullptr) {
			pairingBase = p->getFirstDuty()->getDepStationRead(); // PO can't get pairing from either duty or segments
		}

		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			Duty* beforeDuty = (i == 0) ? nullptr : p->getDuty(i - 1);
			Duty* nextDuty = ((i + 1) >= p->getNumDuties()) ? nullptr : p->getDuty(i + 1);

			int historyBlkMinutes = 0;
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				Segment* flt = (fltIdMap.find(s->getDBId()) == fltIdMap.end()) ? NULL : fltIdMap[s->getDBId()].get();

				if (fltIdMap.find(s->getDBId()) == fltIdMap.end())
					continue;
				this->setDutyBrief(d, pairingBase);
				this->setDutyDebrief(d, pairingBase);
				this->setDutyPickup(d, pairingBase, beforeDuty, nextDuty);
				this->setDutyDropoff(d, pairingBase, beforeDuty, nextDuty);
				s->setStartTimeUtcSch(flt->getStartTimeUtcSch());
				s->setStartTimeLocSch(flt->getStartTimeLocSch());
				s->setEndTimeUtcSch(flt->getEndTimeUtcSch());
				s->setEndTimeLocSch(flt->getEndTimeLocSch());
				s->setStartTimeUtcAct(flt->getStartTimeUtcAct());
				s->setStartTimeLocAct(flt->getStartTimeLocAct());
				s->setEndTimeUtcAct(flt->getEndTimeUtcAct());
				s->setEndTimeLocAct(flt->getEndTimeLocAct());

				//20190222 ain, OP#1840, airport变更
				s->setDepStation(flt->getDepStation());
				s->setArrStation(flt->getArrStation());

				//20190606 ain, mantis#5892, seg.fleet
				s->setFleetCD(flt->getFleetCD());
				s->setSubFleet(flt->getSubFleet());
				RuleParams::GetInstancePtr()->calculateSegPickUpAndDropOff(s, &dbData->airportList);
				if (s->getSplitDutyPickUpMin() != 0 && s->getSplitDutyDropOffMin() != 0) {
					d->setSpiltDutyPickUpMin(s->getSplitDutyPickUpMin());
					d->setSpiltDutyDropOffMin(s->getSplitDutyDropOffMin());
				}
			}

			d->setFlyHoursHistory(historyBlkMinutes / 60.0);
			Segment* first = d->getFirstSegment();
			if (first) {
				shared_ptr<PairingDutyNode> brief = Utility::GetInstancePtr()->getPairingDutyNode(d->pairingDutyNodes, "DUTY", "BRIEF");
				const auto briefMin = brief->getEndUtc() - brief->getStartUtc();
				d->setStartTimeUtcSch(first->getStartTimeUtcSch() - briefMin);
				d->setStartTimeLocSch(first->getStartTimeLocSch() - briefMin);
				d->setStartTimeUtcAct(first->getStartTimeUtcAct() - briefMin);
				d->setStartTimeLocAct(first->getStartTimeLocAct() - briefMin);
				d->setDepartureStation(first->getDepStation());
			}
			Segment* last = d->getLastSegment();
			if (last) {
				shared_ptr<PairingDutyNode> debrief = Utility::GetInstancePtr()->getPairingDutyNode(d->pairingDutyNodes, "DUTY", "DEBRIEF");
				const auto debriefMin = debrief->getEndUtc() - debrief->getStartUtc();
				d->setEndTimeUtcSch(last->getEndTimeUtcSch() + debriefMin);
				d->setEndTimeLocSch(last->getEndTimeLocSch() + debriefMin);
				d->setEndTimeUtcAct(last->getEndTimeUtcAct() + debriefMin);
				d->setEndTimeLocAct(last->getEndTimeLocAct() + debriefMin);
				d->setArrivalStation(last->getArrStation());//OP#1840, airport变更触发重算 debrief
			}
			//OP#2246, 酒店流程, 按首尾 seg.pick/drop更新 duty.pick/drop, 若 seg.pick/drop == 0则忽略
			if (first && first->getSplitDutyPickUpMin() > 0) {
				d->setActualPickupMin(first->getSplitDutyPickUpMin());
			}
			if (last && last->getSplitDutyDropOffMin() > 0) {
				d->setActualDropoffMin(last->getSplitDutyDropOffMin());
			}
		}
		if (p->getNumDuties() > 0) {
			Duty* first = p->getDuty(0);
			Duty* last = p->getDuty(p->getNumDuties() - 1);
			p->setStartTimeUtcSch(first->getStartTimeUtcSch() - first->getMinPickup() * 60);
			p->setStartTimeLocSch(first->getStartTimeLocSch() - first->getMinPickup() * 60);
			p->setStartTimeUtcAct(first->getStartTimeUtcAct() - first->getMinPickup() * 60);
			p->setStartTimeLocAct(first->getStartTimeLocAct() - first->getMinPickup() * 60);
			p->setEndTimeUtcSch(last->getEndTimeUtcSch() + last->getMinDropoff() * 60);
			p->setEndTimeLocSch(last->getEndTimeLocSch() + last->getMinDropoff() * 60);
			p->setEndTimeUtcAct(last->getEndTimeUtcAct() + last->getMinDropoff() * 60);
			p->setEndTimeLocAct(last->getEndTimeLocAct() + last->getMinDropoff() * 60);
		}
	}
	completeRoster();

}
void LegalityChecker::completeRoster(){
	for (auto r : this->_dbData->rosterList){
		if (r->pairId != 0){
			Pairing* p = this->_dbData->pairingIdMap[r->pairId];
			r->setStartTimeUtcSch(p->getStartTimeUtcSch());
			r->setStartTimeUtcAct(p->getStartTimeUtcAct());
			r->setStartTimeLocSch(p->getStartTimeLocSch());
			r->setStartTimeLocAct(p->getStartTimeLocAct());


			/*2023/5/30 用pairingNode设置休息开始时间*/
			const vector<Duty *>& duties = p->getDutyVec();
			Duty * lastduy = duties[duties.size() - 1];
			shared_ptr<PairingDutyNode> dropoff = lastduy->getLastDropoff();
			shared_ptr<PairingDutyNode> debrief = lastduy->getLastDebrief();

			auto endTmUTC = max(dropoff->getEndUtc(), debrief->getEndUtc());

			r->setRestStartUtcSch(max(endTmUTC, p->getEndTimeUtcSch()));
			r->setRestStartUtcAct(max(endTmUTC, p->getEndTimeUtcAct()));

			auto endTmLoc = max(dropoff->getEndLoc(), debrief->getEndLoc());
			
			r->setRestStartLocAct(max(endTmLoc, p->getEndTimeLocAct()));
			r->setRestStartLocSch(max(endTmLoc, p->getEndTimeLocSch()));

			//r->setRestStartUtcSch(p->getEndTimeUtcSch());
			//r->setRestStartUtcAct(p->getEndTimeUtcAct());
			//r->setRestStartLocSch(p->getEndTimeLocSch());

			r->setEndTimeUtcSch(p->getEndTimeUtcSch() + 10 * 3600);
			r->setEndTimeUtcAct(p->getEndTimeUtcAct() + 10 * 3600);
			r->setEndTimeLocSch(p->getEndTimeLocSch() + 10 * 3600);
			r->setEndTimeLocAct(p->getEndTimeLocAct() + 10 * 3600);
			r->location = p->getBase();
			
		}

	}
}

//20200522 ain, 补齐 dutyNode utc赋值, 避免gantt按utc、pbdd弹窗按loc显示不一致
//20190922 ain, mantis#6741, 按航班变动校正brief/debrief/drop时间
//1. 首航班前brief按开始时间不动，结束时间随seg.start变化，保证不留缝隙
//2. 需要在按 flt更新过 segment/duty/pairing时间后执行
void LegalityChecker::resetDutyNodeTime(SharedPtr<CrewDataContext>& dbData, Duty* d, vector<long long>& changeSchStartFLtId, const string& pairingBase, const Duty* beforeDuty, const Duty* nextDuty) {
	int i = 0, j = 0;

	Segment* firstSeg = d->getFirstSegment();
	Segment* lastSeg = d->getLastSegment();
	if (!firstSeg) {
		return;
	}
	//
	//sort
	std::sort(d->pairingDutyNodes.begin(), d->pairingDutyNodes.end(), [](shared_ptr<PairingDutyNode>& n1, shared_ptr<PairingDutyNode>& n2) {
		return n1->getStartLoc() < n2->getStartLoc();
	});
	//
	//定位duty级 BRIEF/DEBRIEF
	shared_ptr<PairingDutyNode> pickup = NULL, brief = NULL, debrief = NULL, dropoff = NULL;
	for (int j = (int)d->pairingDutyNodes.size() - 1; j >= 0; j--) {
		if (d->pairingDutyNodes[j]->getNode() == "PICKUP" && d->pairingDutyNodes[j]->getType() == "DUTY") {
			if (!pickup)
				pickup = d->pairingDutyNodes[j];
		}
		if (d->pairingDutyNodes[j]->getNode() == "BRIEF" && d->pairingDutyNodes[j]->getType() == "DUTY") {
			if (!brief)
				brief = d->pairingDutyNodes[j];
		}
		if (d->pairingDutyNodes[j]->getNode() == "DEBRIEF" && d->pairingDutyNodes[j]->getType() == "DUTY") {
			if (!debrief)
				debrief = d->pairingDutyNodes[j];
		}
		if (d->pairingDutyNodes[j]->getNode() == "DROPOFF" && d->pairingDutyNodes[j]->getType() == "DUTY") {
			if (!dropoff)
				dropoff = d->pairingDutyNodes[j];
		}
	}
	//mantis#6741 12 ruletool 更新航班 duty内航班变动
	vector<shared_ptr<PairingDutyNode>>& pdns = d->pairingDutyNodes;
	const vector<Segment*>& segs = d->getSegments();
	for (std::size_t i = 1; i < segs.size(); i++){
		long long segmentId = segs[i]->getSegmentId();

		const shared_ptr<PairingDutyNode>& segBreif = Utility::GetInstancePtr()->getPairingDutyNode(pdns, "SEGMENT", "BRIEF", segmentId);
		if (segBreif){
			segBreif->setEndLoc(segs[i]->getStartTimeLocAct());
			segBreif->setEndUtc(segs[i]->getStartTimeUtcAct());
			segBreif->setAirport(segs[i]->getDepStation());
			if (find(changeSchStartFLtId.begin(), changeSchStartFLtId.end(), segmentId) != changeSchStartFLtId.end()){
				segBreif->setStartLoc(segs[i]->getStartTimeLocAct() - segs[i]->getBriefTimeInsec());
				segBreif->setStartUtc(segs[i]->getStartTimeUtcAct() - segs[i]->getBriefTimeInsec());
			}
		}
		const shared_ptr<PairingDutyNode>& segPickup = Utility::GetInstancePtr()->getPairingDutyNode(pdns, "SEGMENT", "PICKUP", segmentId);
		if (segPickup){
			segPickup->setAirport(segs[i]->getDepStation());
			if (find(changeSchStartFLtId.begin(), changeSchStartFLtId.end(), segmentId) != changeSchStartFLtId.end()){
				segPickup->setEndLoc(segBreif ? segBreif->getStartLoc() : segs[i]->getStartTimeLocAct());
				segPickup->setEndUtc(segBreif ? segBreif->getStartUtc() : segs[i]->getStartTimeUtcAct());
				segPickup->setStartLoc(segPickup->getEndLoc() - segs[i]->getSplitDutyPickUpMin() * 60);
				segPickup->setStartUtc(segPickup->getEndUtc() - segs[i]->getSplitDutyPickUpMin() * 60);
			}
		}
		const shared_ptr<PairingDutyNode>& segDebreif = Utility::GetInstancePtr()->getPairingDutyNode(pdns, "SEGMENT", "DEBRIEF", segmentId);
		if (segDebreif)
		{
			int debriefSecs = static_cast<int>(segDebreif->getEndLoc() - segDebreif->getStartLoc());
			segDebreif->setStartLoc(segs[i - 1]->getEndTimeLocAct());
			segDebreif->setStartUtc(segs[i - 1]->getEndTimeUtcAct());
			segDebreif->setEndLoc(segDebreif->getStartLoc() + debriefSecs);
			segDebreif->setEndUtc(segDebreif->getStartUtc() + debriefSecs);
			segDebreif->setAirport(segs[i - 1]->getArrStation());
		}

		const shared_ptr<PairingDutyNode>& segDropoff = Utility::GetInstancePtr()->getPairingDutyNode(pdns, "SEGMENT", "DROPOFF", segmentId);
		if (segDropoff)
		{
			int dropoffSecs = static_cast<int>(segDropoff->getEndLoc() - segDropoff->getStartLoc());
			segDropoff->setStartLoc(segDebreif ? segDebreif->getEndLoc() : segs[i - 1]->getEndTimeLocAct());
			segDropoff->setStartUtc(segDebreif ? segDebreif->getEndUtc() : segs[i - 1]->getEndTimeUtcAct());
			segDropoff->setEndLoc(segDropoff->getStartLoc() + dropoffSecs);
			segDropoff->setEndUtc(segDropoff->getStartUtc() + dropoffSecs);
			segDropoff->setAirport(segs[i - 1]->getArrStation());
		}
	}
	//
	//赋值
	this->basicSetting(d, pairingBase, false, beforeDuty, nextDuty);
	int briefMin = d->getMinBrief();
	int briefHour = 3;
	if (dbData->systemParamMap.find("ETD_BRIEF_RECAL_HR") != dbData->systemParamMap.end()){
		briefHour = stoi(dbData->systemParamMap["ETD_BRIEF_RECAL_HR"]);
	}
	if (brief) {
		brief->setEndLoc(firstSeg->getStartTimeLocAct());
		brief->setEndUtc(firstSeg->getStartTimeUtcAct());
		brief->setAirport(firstSeg->getDepStation());
		if (dbData->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" || brief->getIsManualModify() == 0 || d->getBriefNeedRuleReCalc()) {
			if (briefMin == 0) {
				//法规计算MinBrief为0，无论航班如何变动，都要保证Brief时长为0
				brief->setStartLoc(brief->getEndLoc());
				brief->setStartUtc(brief->getEndUtc());
			}
			else {
				brief->setStartLoc(getDutyBriefStartLocByRule(dbData, d));
				brief->setStartUtc(getDutyBriefStartUtcByRule(dbData, d));
			}
		}
		else if (brief->getStartUtc() > brief->getEndUtc()) {
			brief->setStartLoc(brief->getEndLoc());
			brief->setStartUtc(brief->getEndUtc());
		}
	}
	if (pickup){
		pickup->setAirport(firstSeg->getDepStation());
		if (dbData->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" ||  pickup->getIsManualModify() == 0 || d->getBriefNeedRuleReCalc()) {
			if (briefMin == 0) {
				pickup->setEndLoc(firstSeg->getStartTimeLocAct());
				pickup->setEndUtc(firstSeg->getStartTimeUtcAct());
			}
			else {
				pickup->setEndLoc(getDutyBriefStartLocByRule(dbData, d));
				pickup->setEndUtc(getDutyBriefStartUtcByRule(dbData, d));
			}
		}
		if (dbData->systemParamMap["RE_CALC_PICKUP_WHILE_MANUAL_MODIFY"] == "Y" || pickup->getIsManualModify() == 0) {
			pickup->setStartLoc(pickup->getEndLoc() - d->getMinPickup() * 60);
			pickup->setStartUtc(pickup->getEndUtc() - d->getMinPickup() * 60);
		}
		else if (pickup->getStartUtc() > pickup->getEndUtc()) {
			pickup->setStartLoc(pickup->getEndLoc());
			pickup->setStartUtc(pickup->getEndUtc());
		}
	}
	if (debrief) {
		int debriefSecs = d->getMinDebrief() * 60;
		debrief->setStartLoc(lastSeg->getEndTimeLocAct());
		debrief->setStartUtc(lastSeg->getEndTimeUtcAct());
		debrief->setAirport(lastSeg->getArrStation());
		if (dbData->systemParamMap["RE_CALC_DEBRIEF_WHILE_MANUAL_MODIFY"] == "Y" || debrief->getIsManualModify() == 0 || d->getDebriefNeedRuleReCalc()) {
			debrief->setEndLoc(debrief->getStartLoc() + debriefSecs);
			debrief->setEndUtc(debrief->getStartUtc() + debriefSecs);
		}
		else if (debrief->getEndUtc() < debrief->getStartUtc()) {
			debrief->setEndLoc(debrief->getStartLoc());
			debrief->setEndUtc(debrief->getStartUtc());
		}
	}
	if (dropoff) {
		int dropoffSecs = d->getMinDropoff() * 60;
		dropoff->setStartLoc(debrief ? debrief->getEndLoc() : lastSeg->getEndTimeLocAct());
		dropoff->setStartUtc(debrief ? debrief->getEndUtc() : lastSeg->getEndTimeUtcAct());
		dropoff->setAirport(lastSeg->getArrStation());
		if (dbData->systemParamMap["RE_CALC_DROPOFF_WHILE_MANUAL_MODIFY"] == "Y" || dropoff->getIsManualModify() == 0 || d->getDebriefNeedRuleReCalc()) {
			dropoff->setEndLoc(dropoff->getStartLoc() + dropoffSecs);
			dropoff->setEndUtc(dropoff->getStartUtc() + dropoffSecs);
		}else if (dropoff->getEndUtc() < dropoff->getStartUtc()) {
			dropoff->setEndLoc(dropoff->getStartLoc());
			dropoff->setEndUtc(dropoff->getStartUtc());
		}
	}
}


bool LegalityChecker::checkDutyIsNoOperating(Duty * duty){

	for (auto s : duty->getSegments()){
		if (!s->getIsOperating() || s->getAssignment() == "DHD" || s->getAssignment() == "BUS") {
			continue;
		}
		return true;
	}
	return false;
};


/*
	RO接口：
	判断某些新分配Pairings，和Crew的现有Roser是否重叠
	后面根据产品重叠设置经一步增强
*/
//bool LegalityChecker::isOverlap(SharedPtr<CREW> crew, vector<shared_ptr<Pairing>> pairings)
//{
//	if (pairings.empty()) {
//		return false;
//	}
//	
//	//已排完序，防止半环中间掺杂其他的airCrew身上的环
//	time_t staTime = pairings.front()->getStartTimeUtcAct();  
//	time_t endTimeIncludeRest = pairings.back()->getEndTimeIncludingRestUtcAct();
//	time_t endTime = pairings.back()->getEndTimeUtcAct();
//
//	for (const auto& pairing : pairings)
//	{
//		staTime = (staTime > pairing->getStartTimeUtcAct() ? pairing->getStartTimeUtcAct() : staTime);
//		endTimeIncludeRest = (endTimeIncludeRest < pairing->getEndTimeIncludingRestUtcAct() ? pairing->getEndTimeIncludingRestUtcAct() : endTimeIncludeRest);
//		endTime = (endTime < pairing->getEndTimeUtcAct() ? pairing->getEndTimeUtcAct() : endTime);
//	}
//	
//	//判断staTime/endTimeIncludeRest/endTime和Crew现有Roster的重叠关系
//	for (const auto& roster : crew->rosterList) 
//	{
//		long long tmpEndTime = endTimeIncludeRest;
//
//		bool isRest = false;
//		if (this->_dbData->assignmentNameMap.find(roster->duty) != this->_dbData->assignmentNameMap.end())
//		{
//			SharedPtr<ASSIGNMENT> assignment = this->_dbData->assignmentNameMap[roster->duty];
//			if (assignment->TYPE != "W" && assignment->TYPE != "T" && assignment->TYPE != "S")
//				isRest = true;
//		}
//
//		if (isRest)
//			tmpEndTime = endTime;
//		else
//			tmpEndTime = endTimeIncludeRest;
//
//		long long rosterEndTime;
//		long long rosterStartTime;
//		if (roster->pairing) {
//			rosterEndTime = roster->pairing->getEndTimeIncludingRestUtcAct();
//			rosterStartTime = roster->pairing->getStartTimeUtcAct();
//		}
//		else {
//			rosterEndTime = roster->getEndTimeUtcAct();
//			rosterStartTime = roster->getStartTimeUtcAct();
//		}
//
//		if (!((rosterEndTime < staTime) || (rosterStartTime > tmpEndTime)))
//		{
//			return true;
//		}
//	}
//	return false;
//}
bool LegalityChecker::isOverlap(SharedPtr<CREW> crew, vector<shared_ptr<Pairing>> pairings)
{
	if (pairings.empty()) {
		return false;
	}

	for (const auto& pairing : pairings)
	{
		//已排完序，防止半环中间掺杂其他的airCrew身上的环
		time_t staTime = pairing->getStartTimeUtcAct();
		time_t endTimeIncludeRest = pairing->getEndTimeIncludingRestUtcAct();
		time_t endTime = pairing->getEndTimeUtcAct();

		//判断staTime/endTimeIncludeRest/endTime和Crew现有Roster的重叠关系
		for (const auto& roster : crew->rosterList)
		{
			time_t tmpEndTime = endTimeIncludeRest;

			bool isRest = false;
			if (this->_dbData->assignmentNameMap.find(roster->duty) != this->_dbData->assignmentNameMap.end())
			{
				SharedPtr<ASSIGNMENT> assignment = this->_dbData->assignmentNameMap[roster->duty];
				if (assignment->TYPE != "W" && assignment->TYPE != "T" && assignment->TYPE != "S")
					isRest = true;
			}

			if (isRest)
				tmpEndTime = endTime;
			else
				tmpEndTime = endTimeIncludeRest;

			time_t rosterEndTime;
			time_t rosterStartTime;
			if (roster->pairing) {
				rosterEndTime = roster->pairing->getEndTimeIncludingRestUtcAct();
				rosterStartTime = roster->pairing->getStartTimeUtcAct();
			}
			else {
				rosterEndTime = roster->getEndTimeUtcAct();
				rosterStartTime = roster->getStartTimeUtcAct();
			}

			if (!((rosterEndTime < staTime) || (rosterStartTime > tmpEndTime)))
			{
				return true;
			}
		}
	}
	
	return false;
}

bool LegalityChecker::isCheckPairingInRoster(const unsigned int ruleFunc, const long long pairingDbId) {
	map<unsigned int, set<long long>>::const_iterator iter = _transactionRosterPairingDbIdMap.find(ruleFunc);
	if (iter == _transactionRosterPairingDbIdMap.end()) {
		return false;
	}
	set<long long>::const_iterator iter2 = (*iter).second.find(pairingDbId);
	return iter2 != (*iter).second.end();
}

void LegalityChecker::addCheckPairingInRoster(const unsigned int ruleFunc, const vector<SharedPtr<ROSTER>>& rosters) {
	set<long long> pairingIds;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		pairingIds.emplace(roster->pairId);
	}

	map<unsigned int, set<long long>>::iterator iter = _transactionRosterPairingDbIdMap.find(ruleFunc);
	if (iter == _transactionRosterPairingDbIdMap.end()) {
		_transactionRosterPairingDbIdMap[ruleFunc] = pairingIds;
	}
	else {
		(*iter).second.insert(pairingIds.begin(), pairingIds.end());
	}
}

void LegalityChecker::addCheckPairingInRoster(const unsigned int ruleFunc, const long long pairingDbId) {
	set<long long> pairingIds;
	pairingIds.emplace(pairingDbId);

	map<unsigned int, set<long long>>::iterator iter = _transactionRosterPairingDbIdMap.find(ruleFunc);
	if (iter == _transactionRosterPairingDbIdMap.end()) {
		_transactionRosterPairingDbIdMap[ruleFunc] = pairingIds;
	}
	else {
		(*iter).second.insert(pairingIds.begin(), pairingIds.end());
	}
}

void LegalityChecker::removeCheckPairingInRoster(const unsigned int ruleFunc, const long long pairingDbId) {
	if (_transactionRosterPairingDbIdMap.find(ruleFunc) == _transactionRosterPairingDbIdMap.end())
		return;

	auto pairingIds = _transactionRosterPairingDbIdMap[ruleFunc];

	auto it = pairingIds.find(pairingDbId);
	if (it != pairingIds.end()) {
		pairingIds.erase(it);
	}
}

//航班是否使用计划起飞时间来计算MAX_FDP
bool LegalityChecker::isUsedStdOnFlightDelay(const Duty* duty) {
	auto& maxFdpAfterDelayDefinitions = RuleParams::GetInstancePtr()->getMaxFDPAfterDelayDefinitions();

	for (auto& maxFdpAfterDelayDefinition : maxFdpAfterDelayDefinitions) {
		if (maxFdpAfterDelayDefinition->isSTD == nullptr) {
			return false;
		}

		Segment* firstSegemnt = duty->getFirstSegment();
		int delay = static_cast<int>(firstSegemnt->getStartTimeUtcAct() - firstSegemnt->getStartTimeUtcSch());
		if (delay <= 0) {
			return false;
		}
		if (delay >= maxFdpAfterDelayDefinition->totalFlightDelayMinutesLower * 60
			&& delay < maxFdpAfterDelayDefinition->totalFlightDelayMinutesUpper * 60) {
			return *(maxFdpAfterDelayDefinition->isSTD.get());
		}
	}

	return false;
}
