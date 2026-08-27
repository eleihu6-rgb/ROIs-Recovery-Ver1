#ifndef RULE_STATISTICS_H
#define RULE_STATISTICS_H

#include <array>
#include <atomic>
#include <ctime>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include "CrewDB.h"
#include "Index2DArray.h"

using namespace std;

class RuleStatistics
{
public:
	enum class OptimizerRuleStage : unsigned int {
		None = 0,
		SegmentConnection,
		SegmentForward,
		DhdDuty,
		DutyBySegments,
		SingleDuty,
		DutyConnection,
		DutyForward,
		FullPairing,
		Count
	};

	static RuleStatistics* GetInstancePtr();

	void addRuleCallTimes(long long ruleId, unsigned int iCallTimes);
	void addViolatedTimes(long long ruleId);
	void addRuleCallClock(long long ruleId, clock_t iCallClock);
	map<long long, unsigned int> getRuleCalledTimes();
	unordered_map<long long, int> getRuleViolatedTimes();
	map<long long, clock_t> getRuleCalledClock();
	unsigned int getRuleCalledTimes(long long ruleId);

	map<string, int> getNumberOfDowngrade();
	map<string, int> getNumberOfBlockDowngrade();
	void setNumberOfDowngrade(string actingRank, int iNum);
	void setNumberOfBlockDowngrade(string actingRank, int iNum);

	void setNumberOfDowngrade(string& activeRank, string& actingRank, int iNum);
	void setNumberOfBlockDowngrade(string& activeRank, string& actingRank, int iNum);
	int getNumberOfDowngrade(string& activeRank, string& actingRank);
	int getNumberOfBlockDowngrade(string& activeRank, string& actingRank);
	void initRankList(vector<RANK>& ranks, string& airline);
	int getActualPatternInScenario(string para);
	int getActualPatternByDate(string para, time_t date);
	void addActualPatternInScenario(string para, SharedPtr<ROSTER> roster, int iNum);
	void addActualPatternByDate(string para, time_t date, int iNum);
	vector<SharedPtr<ROSTER>> getPatternListInScenario(string para);
	void sortPatternList();

	void printLog(string filename);
	void resetOptimizerRuleViolationStats();
	void registerOptimizerRule(const DBRule& rule);
	void setOptimizerRuleStage(OptimizerRuleStage stage);
	void clearOptimizerRuleStage();
	void addOptimizerViolatedTimes(long long ruleId);
	void addOptimizerViolatedTimesByFunction(unsigned int ruleFunction);
	bool printOptimizerRuleViolationStats(const string& filename);
	static const char* getOptimizerRuleStageName(OptimizerRuleStage stage);

private:
	struct OptimizerRuleMetadata {
		long long ruleId = 0;
		unsigned int function = 0;
		long long ruleParamId = 0;
		long long phase = 0;
		string description;
		string overridebility;
	};

	struct OptimizerRuleStatEntry {
		OptimizerRuleMetadata meta;
		std::array<std::atomic<unsigned long long>, static_cast<size_t>(OptimizerRuleStage::Count)> stageCounts;

		OptimizerRuleStatEntry();
	};

	struct OptimizerRuleFunctionStatEntry {
		unsigned int function = 0;
		std::array<std::atomic<unsigned long long>, static_cast<size_t>(OptimizerRuleStage::Count)> stageCounts;

		OptimizerRuleFunctionStatEntry();
	};

	static RuleStatistics m_pStatic;
	static thread_local OptimizerRuleStage t_optimizerRuleStage;

	RuleStatistics();
	~RuleStatistics();

	map<long long, unsigned int> _runningCalled;
	unordered_map<long long, int> _runningViolatedTimes;
	map<long long, clock_t> _runningClock;
	map<string, int> _maxPattern;
	map<string, int> _numberOfDwongrade;
	map<string, int> _numberOfBlockDwongrade;
	Index2DArray* _downgradesNum = nullptr;
	Index2DArray* _downgradesBlock = nullptr;
	map<string, vector<SharedPtr<ROSTER>>> _pattermRosterList;
	map<string, map<time_t, int>> _maxPatternByDate;

	std::mutex _optimizerRuleStatsMutex;
	std::unordered_map<long long, size_t> _optimizerRuleStatsIndex;
	std::unordered_map<unsigned int, long long> _optimizerUniqueRuleIdByFunction;
	std::vector<std::unique_ptr<OptimizerRuleStatEntry>> _optimizerRuleStats;
	std::unordered_map<unsigned int, size_t> _optimizerRuleFunctionStatsIndex;
	std::vector<std::unique_ptr<OptimizerRuleFunctionStatEntry>> _optimizerRuleFunctionStats;
};

#endif
