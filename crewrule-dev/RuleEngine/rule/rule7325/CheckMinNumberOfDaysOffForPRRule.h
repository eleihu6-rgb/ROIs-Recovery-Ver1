/**
 * @file CheckMinNumberOfDaysOffForPRRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/



#ifndef _CheckMinNumberOfDaysOffForPRRule_H_
#define _CheckMinNumberOfDaysOffForPRRule_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMinNumberOfDaysOffForPRRuleParam.h"
#include "EnumerationDayOffPatternHelper/EnumerationDayOffPatternHelper.h"
#include "EnumerationDayOffPatternHelperParamCache.h"

struct PatternResult {
	std::vector<std::bitset<28>> patternsDay28;
	std::vector<std::bitset<29>> patternsDay29;
	std::vector<std::bitset<30>> patternsDay30;
	std::vector<std::bitset<31>> patternsDay31;
};
class CheckMinNumberOfDaysOffForPRRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7325;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	constexpr static size_t DAY28 = 28;
	constexpr static size_t DAY29 = 29;
	constexpr static size_t DAY30 = 30;
	constexpr static size_t DAY31 = 31;

	explicit CheckMinNumberOfDaysOffForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinNumberOfDaysOffForPRRule::RuleFuncId, CheckMinNumberOfDaysOffForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMinNumberOfDaysOffForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	std::vector<std::vector<EnumerationOccupationStatus>> GetAvailableEnumerationOccupationStatus(const std::shared_ptr<CREW>& crew, const std::vector<const ROSTER*>& rosters) const;

	void PreCalculateCache() const;

private:


	static EnumerationDayOffPatternHelper<DAY28> helperDay28;
	static EnumerationDayOffPatternHelperCache<DAY28> helperCacheDay28;

	static EnumerationDayOffPatternHelper<DAY29> helperDay29;
	static EnumerationDayOffPatternHelperCache<DAY29> helperCacheDay29;

	static EnumerationDayOffPatternHelper<DAY30> helperDay30;
	static EnumerationDayOffPatternHelperCache<DAY30> helperCacheDay30;

	static EnumerationDayOffPatternHelper<DAY31> helperDay31;
	static EnumerationDayOffPatternHelperCache<DAY31> helperCacheDay31;

	std::map<long long, CheckMinNumberOfDaysOffForPRRuleParam> _ruleParamsMap;

	void ParseParam(const InputType& input);

	void CalDOParamCache(std::shared_ptr<CREW> crew, const time_t windowStartLoc, const time_t windowEndLoc) const;

	std::vector<EnumerationOccupationStatus> GetOccupationStatusByRoster(const EnumerationDayOffPatternHelperParamCache& ruleParam, int day, SharedPtr<CrewDataContext>& dbData, SharedPtr<CREW> crew, const std::vector<const ROSTER*>& rosters, time_t rangeStart, time_t rangeEnd, time_t prevRPRosterEndTime, const vector<string>& restAssignmentGroup, bool isSplit, bool& prevStartValid) const;

	bool CheckMinConsecutiveDaysOffByRosterPeriod(std::shared_ptr<CREW> crew, time_t checkStartLoc, time_t checkEndLoc, const bool isFullRP, const EnumerationDayOffPatternHelperParamCache cache, bool preCheck = false) const;

	bool MatchDoAssignment(const EnumerationDayOffPatternHelperParamCache& ruleParam, const ROSTER* roster) const;
	bool MatchLeaveAssignment(const EnumerationDayOffPatternHelperParamCache& ruleParam, const ROSTER* roster) const;


	vector<const ROSTER*> GetRosterInRange(const vector<SharedPtr<ROSTER>> rosters, time_t checkStartLoc, time_t checkEndLoc) const;

	//isNeedGetAllResults: true / false, tracking检查时不需要得到所有的pattern result，给RO的接口需要所有的结果
	PatternResult GetPatternResult(std::shared_ptr<CREW> crew, vector<const ROSTER*> rosterInRange, std::vector<EnumerationOccupationStatus>&, time_t checkStartLoc, time_t checkEndLoc, const bool isFullRP, const EnumerationDayOffPatternHelperParamCache cache, const bool isNeedGetAllResults, bool preCheck) const;
};

#endif //_CheckMinNumberOfDaysOffForPRRule_H_
