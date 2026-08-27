/**
 * @file LimitBeforeAnnualLeaveRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITBEFOREANNUALLEAVERULEPARAM_H_
#define _LIMITBEFOREANNUALLEAVERULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class LimitBeforeAnnualLeaveRule;

class LimitBeforeAnnualLeaveRuleParam : public RuleParam {
friend class LimitBeforeAnnualLeaveRule;
private:
    explicit LimitBeforeAnnualLeaveRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6010;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		ASSIGNMENTS = 4,
		MIN_PERIOD_DAYS = 5,
		CHECK_OUT_REFERENCE_TIME = 6,
		CHECK_IN_REFERENCE_TIME = 7,
		SEVERITY = 8
    };

	//所属基地,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _bases{};
	//人员级别,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _ranks{};
	//人员机型,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	//任务类型组，填写Assignment Group,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _assignments{};
	//最小连续天,例如：7
	unsigned int _minPeriodDays{};
	//签出参照（基准）时间（时分）,格式：HH:mm，例如：22:00，表示22时0分
	std::string _checkOutReferenceTime{};
	int _checkOutReferenceTimeMinutes{};
	//签入参照（基准）时间（时分）,格式：HH:mm，例如：22:00，表示22时0分
	std::string _checkInReferenceTime{};
	int _checkInReferenceTimeMinutes{};
	
	void ParseParam(const std::string& paramString);
    //bool MatchParam(const std::string& composition, const long& reportTime, bool isAugment) const;

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAssignment(const std::string& assignment) const;

	//annualLeaveDays：计算获得年假连续天数
	bool MatchMinPeriodDays(const int annualLeaveDays) const;

	bool MatchCheckInReferenceTime(const time_t breifStartTimeLoc, const time_t beforeRosterEnd) const;

	bool MatchCheckOutReferenceTime(const time_t debreifEndTimeLoc, const time_t afterRosterStart) const;
};

#endif //_LIMITBEFOREANNUALLEAVERULEPARAM_H_
