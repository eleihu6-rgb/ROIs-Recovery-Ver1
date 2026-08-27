/**
 * @file CheckMaxFlightTimeInPeriodForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMAXFLIGHTTIMEINPERIODFOREVAFDRULE_H_
#define _CHECKMAXFLIGHTTIMEINPERIODFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFlightTimeInPeriodForEvaFdRuleParam.h"
#include "../period/SlideListener.h"

class WorkPeriod;
class RestPeriod;
class BaseActivityPeriod;
class WindowTime;
class Period;
class MaxFlightTimeInPeriodSlideListener;

class CheckMaxFlightTimeInPeriodForEvaFdRule: public BasicRule {
    friend class MaxFlightTimeInPeriodSlideListener;
public:
    struct CheckSelection {
        bool checkFDP = true;
        bool checkBLH = true;
        bool checkDP = true;
    };
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7205;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMaxFlightTimeInPeriodForEvaFdRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMaxFlightTimeInPeriodForEvaFdRule::RuleFuncId, CheckMaxFlightTimeInPeriodForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMaxFlightTimeInPeriodForEvaFdRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    enum BaseTimeType {
        SEGMENT_START = 0,
        SEGMENT_END = 1,
        DUTY_FDP_START = 2,
        DUTY_FDP_END = 3,
		DUTY_DP_START = 4,
		DUTY_DP_END = 5,
        BASETIME_GIVEN = 6
    };

    std::vector<MaxFlightTimeInPeriodForEvaFdRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    bool CheckRule(const vector<Duty*>& duties, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap) const;
    bool CheckRule(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap) const;

	//检查segment向前连续24小时。 isCeil：true 时间向上取整，false-时间向下取整
    bool CheckDutyBefore(const CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType baseTimeType, const bool isCeil, const std::size_t currDutyIndex, const std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam, const CheckSelection& selection) const;
    bool CheckDutyBefore(const CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType baseTimeType, const bool isCeil, const std::size_t currIndex, const std::size_t currDutySegmentIndex, const vector<shared_ptr<BaseActivityPeriod>>& allActivityPeriods, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam, const CheckSelection& selection) const;

	//检查segment向后连续24小时。isCeil：true 时间向上取整，false-时间向下取整
    bool CheckDutyAfter(const CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType baseTimeType, const bool isCeil, const std::size_t currDutyIndex, const std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam, const CheckSelection& selection, time_t windowStartLocIfGiven=-1) const;
    bool CheckDutyAfter(const CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType baseTimeType, const bool isCeil, const std::size_t currIndex, const std::size_t currDutySegmentIndex, const vector<shared_ptr<BaseActivityPeriod>>& allActivityPeriods, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam, const CheckSelection& checkFlag, time_t windowStartLocIfGiven = -1) const;

    bool CheckRule(const MaxFlightTimeInPeriodForEvaFdRuleParam::CumulativeDuration& cumulativeDuration, const Activity* activity, const time_t windowStartLoc, const time_t windowEndLoc, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam) const;

    [[deprecated("CheckRule not used")]]
    bool CheckRule(const long blhTotalMins, const time_t windowStart, const time_t windowEnd, int offsetTZMinutes, const Period* period, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam) const;

    int GetTimeZoneOffset(const time_t baseUtcTime, const std::string base) const;

    vector<BaseTimeType> GetAllBaseTimeTypes() const;

    time_t GetBaseTime(const BaseTimeType baseTimeType, const Duty* duty, const Segment* segment) const;

    time_t GetBaseTime(const BaseTimeType baseTimeType, const ROSTER* groundRoster) const;

    //是否忽略当前ActivityPeriod，则不做检查基准。主要用于：检查FDP、BLH时，不需要使用地面任务作为检查基准
    bool IgnoreActivityPeriod(const shared_ptr<BaseActivityPeriod>& activityPeriod, const CheckSelection& checkSelection) const;

    void ThrowRuleViolationForBLH(const Activity* activity) const;

    void ThrowRuleViolationForFDP(const Activity* activity) const;

    void ThrowRuleViolationForDP(const Activity* activity) const;

};

class MaxFlightTimeInPeriodSlideListener : public SlideListener {
public:

    MaxFlightTimeInPeriodSlideListener(const CheckMaxFlightTimeInPeriodForEvaFdRule* rule) : _rule(rule) { }


    bool OnSlide(bool& next, bool& ignoreSlide, const Period* period, const Period* nextPeriod, const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes, void* param, ...) const override;

private:

    const CheckMaxFlightTimeInPeriodForEvaFdRule* _rule;

    mutable time_t _currWindowStart = -1;

    mutable time_t _currWindowEnd = -1;

    mutable long _BLHTotalMinutes = -1; //累计飞时（FT, 也称 BLH)（分钟数）

    //判断是否与当前时间窗口相同
    bool isSameWindow(const time_t windowStart, const time_t windowEnd) const {
        return _currWindowStart == windowStart && _currWindowEnd == windowEnd;
    }
};

#endif //_CHECKMAXFLIGHTTIMEINPERIODFOREVAFDRULE_H_
