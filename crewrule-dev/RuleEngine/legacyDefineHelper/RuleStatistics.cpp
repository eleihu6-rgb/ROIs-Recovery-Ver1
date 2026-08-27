
#include "RuleStatistics.h"
#include <algorithm>
#include <fstream>
#include <unordered_set>

// 类的静态成员变量要在类体外进行定义
RuleStatistics RuleStatistics::m_pStatic;
thread_local RuleStatistics::OptimizerRuleStage RuleStatistics::t_optimizerRuleStage =
	RuleStatistics::OptimizerRuleStage::None;

RuleStatistics::OptimizerRuleStatEntry::OptimizerRuleStatEntry()
{
	for (auto& count : stageCounts) {
		count.store(0, std::memory_order_relaxed);
	}
}

RuleStatistics::OptimizerRuleFunctionStatEntry::OptimizerRuleFunctionStatEntry()
{
	for (auto& count : stageCounts) {
		count.store(0, std::memory_order_relaxed);
	}
}

RuleStatistics::RuleStatistics()
{
}

void RuleStatistics::initRankList(vector<RANK>& ranks,string& airline)
{
	vector<string> actingRank, activeRank;

	for (vector<RANK>::iterator rank = ranks.begin(); rank != ranks.end(); rank++)
	{
		//if ((*rank).airline == airline)
		//{
			actingRank.push_back((*rank).rank);
			activeRank.push_back((*rank).rank);
		//}
	}
	_downgradesNum = new Index2DArray("Rank");
	_downgradesBlock = new Index2DArray("Rank");
	_downgradesNum->init(actingRank, activeRank);
	_downgradesBlock->init(actingRank, activeRank);
}

RuleStatistics::~RuleStatistics()
{
	delete _downgradesNum;
	delete _downgradesBlock;
}

RuleStatistics* RuleStatistics::GetInstancePtr()
{
	//if (NULL == m_pStatic)
	//{
	//	m_pStatic = new RuleStatistics();
	//}
	//_downgrades = new Index2DArray();
	//20190222 ain, 单例模式改为基于对象, 避免mem leak
	return &m_pStatic;
}

const char* RuleStatistics::getOptimizerRuleStageName(OptimizerRuleStage stage)
{
	switch (stage) {
	case OptimizerRuleStage::SegmentConnection:
		return "segment_connection";
	case OptimizerRuleStage::SegmentForward:
		return "segment_forward";
	case OptimizerRuleStage::DhdDuty:
		return "dhd_duty";
	case OptimizerRuleStage::DutyBySegments:
		return "duty_by_segments";
	case OptimizerRuleStage::SingleDuty:
		return "single_duty";
	case OptimizerRuleStage::DutyConnection:
		return "duty_connection";
	case OptimizerRuleStage::DutyForward:
		return "duty_forward";
	case OptimizerRuleStage::FullPairing:
		return "full_pairing";
	case OptimizerRuleStage::None:
	case OptimizerRuleStage::Count:
	default:
		return "";
	}
}

void RuleStatistics::addViolatedTimes(long long ruleId)
{
	unordered_map<long long, int>::iterator l_it = _runningViolatedTimes.find(ruleId);
	if (l_it == _runningViolatedTimes.end())
		_runningViolatedTimes.insert(pair<long long, int>(ruleId, 1));
	else
		(*l_it).second +=1;

	addOptimizerViolatedTimes(ruleId);

}

void RuleStatistics::addRuleCallTimes(long long ruleId, unsigned int iCallTimes)
{
	map<long long, unsigned int>::iterator l_it = _runningCalled.find(ruleId);
	if (l_it == _runningCalled.end())
		_runningCalled.insert(pair<long long, int>(ruleId, iCallTimes));
	else
		(*l_it).second += iCallTimes;
}

void RuleStatistics::addRuleCallClock(long long ruleId, clock_t iCallClock)
{
	map<long long, clock_t>::iterator l_it = _runningClock.find(ruleId);
	if (l_it == _runningClock.end())
		_runningClock.insert(pair<long long, int>(ruleId, iCallClock));
	else
		(*l_it).second += iCallClock;

}

unsigned int RuleStatistics::getRuleCalledTimes(long long ruleId)
{
	int iReturn = 0;
	map<long long, unsigned int>::iterator l_it = _runningCalled.find(ruleId);
	if (l_it != _runningCalled.end())
		iReturn = (*l_it).second;
	return iReturn;
}

void RuleStatistics::setNumberOfDowngrade(string actingRank,int iNum)
{
	//string activeRank = "CA";
	map<string, int>::iterator l_it = _numberOfDwongrade.find(actingRank);
	if (l_it == _numberOfDwongrade.end())
	{
		_numberOfDwongrade.insert(pair<string, int>(actingRank, iNum));
		//_downgradesNum->setValue(activeRank, actingRank, iNum);
	}
	else
	{
		(*l_it).second += iNum;
		//_downgradesNum->setValue(activeRank, actingRank, (*l_it).second);
	}
}

void RuleStatistics::setNumberOfDowngrade(string& activeRank, string& actingRank, int iNum)
{
	int iSet = iNum + _downgradesNum->getValue(activeRank, actingRank);
	_downgradesNum->setValue(activeRank, actingRank, iSet);
}

void RuleStatistics::setNumberOfBlockDowngrade(string& activeRank, string& actingRank, int iNum)
{
	int iSet = iNum + _downgradesBlock->getValue(activeRank, actingRank);
	_downgradesBlock->setValue(activeRank, actingRank, iSet);
}


void RuleStatistics::setNumberOfBlockDowngrade(string actingRank, int iNum)
{ 
	//string activeRank = "CA";
	map<string, int>::iterator l_it = _numberOfBlockDwongrade.find(actingRank);
	if (l_it == _numberOfBlockDwongrade.end())
	{
		_numberOfBlockDwongrade.insert(pair<string, int>(actingRank, iNum));
		//_downgradesBlock->setValue(activeRank, actingRank, iNum);
	}
	else
	{
		(*l_it).second += iNum;
		//_downgradesBlock->setValue(activeRank, actingRank, (*l_it).second);
	}
}

int RuleStatistics::getNumberOfDowngrade(string& activeRank, string& actingRank)
{
	int iReturn = _downgradesNum->getValue(activeRank, actingRank);
	return iReturn;
}

int RuleStatistics::getNumberOfBlockDowngrade(string& activeRank, string& actingRank)
{
	int iReturn = _downgradesBlock->getValue(activeRank, actingRank);
	return iReturn;
}

//iNum=-1,1
void RuleStatistics::addActualPatternInScenario(string para, SharedPtr<ROSTER> roster, int iNum)
{
	map<string, int>::iterator l_it = _maxPattern.find(para);
	if (l_it == _maxPattern.end())
	{
		_maxPattern.insert(pair<string, int>(para, iNum));
	}
	else
	{
		(*l_it).second += iNum;
	}
	
	map<string, vector<SharedPtr<ROSTER>>>::iterator roster_it = _pattermRosterList.find(para);
	if (roster_it == _pattermRosterList.end())
	{
		vector<SharedPtr<ROSTER>> rosters;
		rosters.push_back(roster);
		_pattermRosterList.insert(pair<string, vector<SharedPtr<ROSTER>>>(para, rosters));
	}
	else
	{
		if (iNum>0)
			(*roster_it).second.push_back(roster);
		else if (iNum < 0)
		{
			vector<SharedPtr<ROSTER>>& delRosters = (*roster_it).second;
			for (vector<SharedPtr<ROSTER>>::iterator delRoster = delRosters.begin(); delRoster != delRosters.end(); ++delRoster)
			{
				if ((*delRoster)->rosterId == roster->rosterId)
				{
					delRosters.erase(delRoster);
					//printf("Debug: del roster from temp rosters[8073]\n.");
					break;
				}
			}
		}
			
	}
	
}

void RuleStatistics::addActualPatternByDate(string para, time_t date, int iNum)
{
	map<string, map<time_t, int>>::iterator l_it = _maxPatternByDate.find(para);
	if (l_it == _maxPatternByDate.end())
	{
		map<time_t, int> dateMap;
		dateMap.insert(pair<time_t, int>(date, iNum));
		_maxPatternByDate.insert(pair<string, map<time_t, int>>(para, dateMap));
	}
	else
	{
		map<time_t, int>::iterator d_it = (*l_it).second.find(date);
		if (d_it == (*l_it).second.end()) {
			(*l_it).second.insert(pair<time_t, int>(date, iNum));
		}
		else {
			(*d_it).second += iNum;
		}
	}

}


int RuleStatistics::getActualPatternInScenario(string para)
{
	int iReturn = 0;
	map<string, int>::iterator l_it = _maxPattern.find(para);
	if (l_it != _maxPattern.end())
		iReturn = (*l_it).second;
	return iReturn;
}

int RuleStatistics::getActualPatternByDate(string para, time_t date)
{
	int iReturn = 0;
	map<string, map<time_t, int>>::iterator l_it = _maxPatternByDate.find(para);
	if (l_it != _maxPatternByDate.end()) {
		map<time_t, int>::iterator d_it = (*l_it).second.find(date);
		if (d_it != (*l_it).second.end()) {
			iReturn = (*d_it).second;
		}
	}
	return iReturn;
}

vector<SharedPtr<ROSTER>> RuleStatistics::getPatternListInScenario(string para)
{
	vector<SharedPtr<ROSTER>> rosters;
	map<string, vector<SharedPtr<ROSTER>>>::iterator roster_it = _pattermRosterList.find(para);
	if (roster_it != _pattermRosterList.end())
		rosters=(*roster_it).second;
	
	return rosters;
}

bool rostersCmp(SharedPtr<ROSTER> m1, SharedPtr<ROSTER> m2)
{
	return m1->actStrUtc < m2->actStrUtc;
}
void RuleStatistics::sortPatternList()
{
	for (map<string, vector<SharedPtr<ROSTER>>>::iterator rosters = _pattermRosterList.begin(); rosters != _pattermRosterList.end(); ++rosters)
	{
		vector<SharedPtr<ROSTER>>& sorts = (*rosters).second;
		stable_sort(sorts.begin(), sorts.end(), rostersCmp);
	}
}

map<string, int> RuleStatistics::getNumberOfDowngrade()
{
	return _numberOfDwongrade;
}
map<string, int> RuleStatistics::getNumberOfBlockDowngrade()
{ 
	return _numberOfBlockDwongrade; 
}

map<long long, unsigned int> RuleStatistics::getRuleCalledTimes(){ return _runningCalled; };
unordered_map<long long, int> RuleStatistics::getRuleViolatedTimes() { return _runningViolatedTimes; };
map<long long, clock_t> RuleStatistics::getRuleCalledClock(){ return _runningClock; };

void RuleStatistics::resetOptimizerRuleViolationStats()
{
	std::lock_guard<std::mutex> lock(_optimizerRuleStatsMutex);
	for (const auto& stat : _optimizerRuleStats) {
		for (auto& count : stat->stageCounts) {
			count.store(0, std::memory_order_relaxed);
		}
	}
	for (const auto& stat : _optimizerRuleFunctionStats) {
		for (auto& count : stat->stageCounts) {
			count.store(0, std::memory_order_relaxed);
		}
	}
}

void RuleStatistics::registerOptimizerRule(const DBRule& rule)
{
	std::lock_guard<std::mutex> lock(_optimizerRuleStatsMutex);
	if (_optimizerRuleStatsIndex.find(rule.idRule) != _optimizerRuleStatsIndex.end()) {
		return;
	}

	const auto uniqueRuleIt = _optimizerUniqueRuleIdByFunction.find(rule.function);
	if (uniqueRuleIt == _optimizerUniqueRuleIdByFunction.end()) {
		_optimizerUniqueRuleIdByFunction.emplace(rule.function, rule.idRule);
	}
	else if (uniqueRuleIt->second != rule.idRule) {
		uniqueRuleIt->second = 0;
	}

	if (_optimizerRuleFunctionStatsIndex.find(rule.function) == _optimizerRuleFunctionStatsIndex.end()) {
		auto functionStat = std::make_unique<OptimizerRuleFunctionStatEntry>();
		functionStat->function = rule.function;
		_optimizerRuleFunctionStatsIndex.emplace(rule.function, _optimizerRuleFunctionStats.size());
		_optimizerRuleFunctionStats.emplace_back(std::move(functionStat));
	}

	auto stat = std::make_unique<OptimizerRuleStatEntry>();
	stat->meta.ruleId = rule.idRule;
	stat->meta.function = rule.function;
	stat->meta.ruleParamId = rule.idRuleParam;
	stat->meta.phase = rule.phase;
	stat->meta.description = rule.description;
	stat->meta.overridebility = rule.overridebility;
	_optimizerRuleStatsIndex.emplace(rule.idRule, _optimizerRuleStats.size());
	_optimizerRuleStats.emplace_back(std::move(stat));
}

void RuleStatistics::setOptimizerRuleStage(OptimizerRuleStage stage)
{
	t_optimizerRuleStage = stage;
}

void RuleStatistics::clearOptimizerRuleStage()
{
	t_optimizerRuleStage = OptimizerRuleStage::None;
}

void RuleStatistics::addOptimizerViolatedTimes(long long ruleId)
{
	if (ruleId <= 0 || t_optimizerRuleStage == OptimizerRuleStage::None) {
		return;
	}

	const auto it = _optimizerRuleStatsIndex.find(ruleId);
	if (it == _optimizerRuleStatsIndex.end()) {
		return;
	}

	const auto ruleStatIndex = it->second;
	auto& ruleStageCounts = _optimizerRuleStats.at(ruleStatIndex)->stageCounts;
	ruleStageCounts[static_cast<size_t>(OptimizerRuleStage::None)].fetch_add(1, std::memory_order_relaxed);
	ruleStageCounts[static_cast<size_t>(t_optimizerRuleStage)].fetch_add(1, std::memory_order_relaxed);

	const auto functionIt = _optimizerRuleFunctionStatsIndex.find(_optimizerRuleStats.at(ruleStatIndex)->meta.function);
	if (functionIt == _optimizerRuleFunctionStatsIndex.end()) {
		return;
	}

	auto& functionStageCounts = _optimizerRuleFunctionStats.at(functionIt->second)->stageCounts;
	functionStageCounts[static_cast<size_t>(OptimizerRuleStage::None)].fetch_add(1, std::memory_order_relaxed);
	functionStageCounts[static_cast<size_t>(t_optimizerRuleStage)].fetch_add(1, std::memory_order_relaxed);
}

void RuleStatistics::addOptimizerViolatedTimesByFunction(unsigned int ruleFunction)
{
	if (t_optimizerRuleStage == OptimizerRuleStage::None) {
		return;
	}

	const auto functionIt = _optimizerRuleFunctionStatsIndex.find(ruleFunction);
	if (functionIt == _optimizerRuleFunctionStatsIndex.end()) {
		return;
	}

	auto& functionStageCounts = _optimizerRuleFunctionStats.at(functionIt->second)->stageCounts;
	functionStageCounts[static_cast<size_t>(OptimizerRuleStage::None)].fetch_add(1, std::memory_order_relaxed);
	functionStageCounts[static_cast<size_t>(t_optimizerRuleStage)].fetch_add(1, std::memory_order_relaxed);

	const auto uniqueRuleIt = _optimizerUniqueRuleIdByFunction.find(ruleFunction);
	if (uniqueRuleIt != _optimizerUniqueRuleIdByFunction.end() && uniqueRuleIt->second > 0) {
		const auto ruleIt = _optimizerRuleStatsIndex.find(uniqueRuleIt->second);
		if (ruleIt != _optimizerRuleStatsIndex.end()) {
			auto& ruleStageCounts = _optimizerRuleStats.at(ruleIt->second)->stageCounts;
			ruleStageCounts[static_cast<size_t>(OptimizerRuleStage::None)].fetch_add(1, std::memory_order_relaxed);
			ruleStageCounts[static_cast<size_t>(t_optimizerRuleStage)].fetch_add(1, std::memory_order_relaxed);
		}
	}
}

bool RuleStatistics::printOptimizerRuleViolationStats(const string& filename)
{
	struct OutputRow {
		long long ruleId = 0;
		unsigned int function = 0;
		string scope;
		string stage;
		unsigned long long failCount = 0;
		long long ruleParamId = 0;
		string description;
		long long phase = 0;
		string overridebility;
	};

	std::vector<OutputRow> rows;
	{
		std::lock_guard<std::mutex> lock(_optimizerRuleStatsMutex);
		rows.reserve((_optimizerRuleStats.size() + _optimizerRuleFunctionStats.size()) * (static_cast<size_t>(OptimizerRuleStage::Count) - 1));
		std::unordered_set<unsigned int> functionsWithInstanceStats;
		for (const auto& stat : _optimizerRuleStats) {
			const auto totalCount = stat->stageCounts[static_cast<size_t>(OptimizerRuleStage::None)].load(std::memory_order_relaxed);
			if (totalCount == 0) {
				continue;
			}
			functionsWithInstanceStats.insert(stat->meta.function);

			rows.push_back(OutputRow{
				stat->meta.ruleId,
				stat->meta.function,
				"instance",
				"all",
				totalCount,
				stat->meta.ruleParamId,
				stat->meta.description,
				stat->meta.phase,
				stat->meta.overridebility
			});

			for (size_t stageIndex = static_cast<size_t>(OptimizerRuleStage::SegmentConnection);
				 stageIndex < static_cast<size_t>(OptimizerRuleStage::Count);
				 ++stageIndex) {
				const auto count = stat->stageCounts[stageIndex].load(std::memory_order_relaxed);
				if (count == 0) {
					continue;
				}
				rows.push_back(OutputRow{
					stat->meta.ruleId,
					stat->meta.function,
					"instance",
					getOptimizerRuleStageName(static_cast<OptimizerRuleStage>(stageIndex)),
					count,
					stat->meta.ruleParamId,
					stat->meta.description,
					stat->meta.phase,
					stat->meta.overridebility
				});
			}
		}

		for (const auto& stat : _optimizerRuleFunctionStats) {
			if (functionsWithInstanceStats.find(stat->function) != functionsWithInstanceStats.end()) {
				continue;
			}

			const auto totalCount = stat->stageCounts[static_cast<size_t>(OptimizerRuleStage::None)].load(std::memory_order_relaxed);
			if (totalCount == 0) {
				continue;
			}

			rows.push_back(OutputRow{
				0,
				stat->function,
				"function",
				"all",
				totalCount,
				0,
				"",
				0,
				""
			});

			for (size_t stageIndex = static_cast<size_t>(OptimizerRuleStage::SegmentConnection);
				 stageIndex < static_cast<size_t>(OptimizerRuleStage::Count);
				 ++stageIndex) {
				const auto count = stat->stageCounts[stageIndex].load(std::memory_order_relaxed);
				if (count == 0) {
					continue;
				}
				rows.push_back(OutputRow{
					0,
					stat->function,
					"function",
					getOptimizerRuleStageName(static_cast<OptimizerRuleStage>(stageIndex)),
					count,
					0,
					"",
					0,
					""
				});
			}
		}
	}

	std::stable_sort(rows.begin(), rows.end(), [](const OutputRow& lhs, const OutputRow& rhs) {
		if (lhs.stage == "all" && rhs.stage != "all") return true;
		if (lhs.stage != "all" && rhs.stage == "all") return false;
		if (lhs.failCount != rhs.failCount) return lhs.failCount > rhs.failCount;
		if (lhs.function != rhs.function) return lhs.function < rhs.function;
		if (lhs.scope != rhs.scope) return lhs.scope < rhs.scope;
		if (lhs.ruleId != rhs.ruleId) return lhs.ruleId < rhs.ruleId;
		return lhs.stage < rhs.stage;
	});

	std::ofstream statsFile(filename, ios::out);
	if (!statsFile.is_open()) {
		return false;
	}

	statsFile << "rule_function\tscope\trule_id\tstage\tfail_count\trule_param_id\tdescription\tphase\toverridebility\n";
	for (const auto& row : rows) {
		statsFile << row.function << '\t'
			<< row.scope << '\t'
			<< row.ruleId << '\t'
			<< row.stage << '\t'
			<< row.failCount << '\t'
			<< row.ruleParamId << '\t'
			<< row.description << '\t'
			<< row.phase << '\t'
			<< row.overridebility << '\n';
	}

	return true;
}

void RuleStatistics::printLog(string filename) {

	ofstream ruleStatisticsFile;
	ruleStatisticsFile.open(filename, ios::out);

	// Rule statistics - begin
	ruleStatisticsFile << "Number: " << endl;
	//map<int, int>& ruleStatisticsNum = _runningViolatedTimes;
	for (map<long long, unsigned int>::iterator ruleStatItr = _runningCalled.begin(); ruleStatItr != _runningCalled.end(); ruleStatItr++)
	{
		ruleStatisticsFile << "    " << (*ruleStatItr).first << ": " << (*ruleStatItr).second << endl;
	}

	// Rule statistics - begin
	ruleStatisticsFile << "Violated: " << endl;
	//map<int, int> ruleViolationStatisticsNum = _runningViolatedTimes;
	for (unordered_map<long long, int>::iterator ruleStatItr = _runningViolatedTimes.begin(); ruleStatItr != _runningViolatedTimes.end(); ruleStatItr++)
	{
		ruleStatisticsFile << "    " << (*ruleStatItr).first << ": " << (*ruleStatItr).second << endl;
	}

	ruleStatisticsFile << "Time: " << endl;
	//map<int, clock_t> ruleStatisticsTime = RORuleEngine::instance()->ruleCalledStatisticsTime();
	for (map<long long, clock_t>::iterator ruleStatItr = _runningClock.begin(); ruleStatItr != _runningClock.end(); ruleStatItr++)
	{
		ruleStatisticsFile << "    " << (*ruleStatItr).first << ": " << (*ruleStatItr).second << endl;
	}

	ruleStatisticsFile.close();
	// Rule statistics - end
}
