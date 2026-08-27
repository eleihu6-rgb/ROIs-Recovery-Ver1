/**
 * @file LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-26
**/

#ifndef _LIMITLATEFINISHANDEARLYSTARTOFREDEYEDUTYFORHXRULEPARAM_H_
#define _LIMITLATEFINISHANDEARLYSTARTOFREDEYEDUTYFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule;

class LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam : public RuleParam {
	friend class LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule;
private:
    explicit LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7486;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 17;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		ACC_STATE = 5,
		ASSIGNMENT_GROUPS = 6,
		ASSIGNMENTS = 7,
		CONSECUTIVE_DAYS = 8,
		ALLOWED_LNP_CONSECUTIVE_TIMES = 9,
		LNP_TIMES_RANGE = 10,
		PRE_MIN_REST = 11,
		PRE_LOCALNIGHT_TIMES = 12,
		POST_MIN_REST = 13,
		POST_LOCALNIGHT_TIMES = 14,
		EVERY_DUTY_MAX_FDP = 15,
		EXCEPTION_CODES = 16,
		SEVERITY = 17
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//适应状态。适应状态取值：A或U
	std::string _accState{};

	//Duty/Ground Roster的任务组。多个值使用“|”分隔并支持*通配（暂时不用）
	std::string _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;

	//Duty/Ground Roster的任务类型,多个值使用“|”分隔并支持*通配（暂时不用）
	std::string _assignments{};
	AssignmentMatchExpression<Activity> _assignmentMatch;

	//连续天数（基地日历日，基地时区）。
	std::string _strConsecutiveDays{};
	int _consecutiveDays{};

	//允许LNP（红眼任务）的连续次数。取值范围:[n,m]
	std::string _strLNPConsecutiveTimes{};
	int _lnpConsecutiveTimesLower{};
	int _lnpConsecutiveTimesUpper{};

	//LNP （红眼任务）次数。格式：n-m，取值范围：[n,m]
	std::string _strLNPTimesRange{};
	int _lnpTimesRangeLower{};
	int _lnpTimesRangeUpper{};

	//开始前最小休息时间。格式：HH:mm,支持*忽略本参数
	std::string _strPrevMinRest{};
	int _prevMinRestMinutes{};

	//开始前最少几个LocalNight。格式：数值,,支持*忽略本参数
	std::string _strPrevMinLocalNightNums{};
	int _prevMinLocalNightNums{};

	//结束后最小休息时间。格式：HH:mm,支持*忽略本参数
	std::string _strPostMinRest{};
	int _postMinRestMinutes{};

	//结束后最少几个LocalNight。格式：数值,,支持*忽略本参数
	std::string _strPostMinLocalNightNums{};
	int _postMinLocalNightNums{};

	//每个DUTY的最大FDP范围。格式：HH:mm-HH:mm, 取值范围：[n,m]
	std::string _strMaxFDPOfDutyRange{};
	int _maxFDPOfDutyRangeMinutesLower{};
	int _maxFDPOfDutyRangeMinutesUpper{};

	//排除告警的代码tsFlag。多个值使用“|”分隔并支持*通配
	std::set<std::string> _exceptionCodes{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAccState(const Activity* activity) const;

	bool CheckPrevMinRest(const int actRestMinutes) const;
	bool CheckPrevMinLocalNightNums(const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int offsetTZMinutes) const;

	bool CheckPostMinRest(const int actRestMinutes) const;
	bool CheckPostMinLocalNightNums(const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int offsetTZMinutes) const;
public:
	enum class WarnCode {
		NO_WARN = 0, //无告警
		PREV_MIN_REST = 1, //Prev Min Rest不满足告警
		PREV_MIN_LOCALNIGHT = 2, //Prev Min LocalNight Nums不满足告警
		POST_MIN_REST = 4, //Prev Min Rest不满足告警
		POST_MIN_LOCALNIGHT = 8 //Prev Min LocalNight Nums不满足告警
	};

	bool MatchParam(const Activity* activity) const;

	//检查红眼任务满足Duty的Max FDP要求
	bool CheckMaxFDPOfDuty(const Activity* activity) const;

	//检查是否满足红眼任务前面的休息要求
	int CheckPrevRest(const int actRestMinutes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int offsetTZMinutes) const;

	//检查是否满足红眼任务后面的休息要求
	int CheckPostRest(const int actRestMinutes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int offsetTZMinutes) const;
};

#endif //_LIMITLATEFINISHANDEARLYSTARTOFREDEYEDUTYFORHXRULEPARAM_H_
