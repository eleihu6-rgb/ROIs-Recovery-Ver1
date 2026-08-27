/**
 * @file ConsecutiveDutyDaysOffForHXRuleParam.h
 * @brief 日历月最少N次连续X个DDO规则参数类
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-05-28
**/

#ifndef _CONSECUTIVEDUTYDAYSOFFFORHXRULEPARAM_H_
#define _CONSECUTIVEDUTYDAYSOFFFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include <string>

class LimitConsecutiveDutyDaysOffForHXRule;

class ConsecutiveDutyDaysOffForHXRuleParam : public RuleParam {
	friend class LimitConsecutiveDutyDaysOffForHXRule;
private:
    explicit ConsecutiveDutyDaysOffForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7493;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		BASES = 1,
		RANKS,
		FLEETS,
		TEAMS,
		CONSECUTIVE_DAYS_OFF,
		PERIOD,
		UNIT,
		MIN_TIMES,
		MAX_TIMES
    };

	//所属基地,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _teams{};

	//连续的DDO数量，整数型
	int _consecutiveDaysOff{};

	//检查时间范围，整数型
	int _period{};

	//检查时间单位，取值：CM-日历月
	std::string _unit{};

	//连续DDO出现的最小次数，整数型
	int _minTimes{1};

	//连续DDO出现的最大次数，整数型
	int _maxTimes{9999};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
public:
	//获得检查时间单位
	std::string GetUnit() const { return _unit; }

	//获得检查时间范围
	int GetPeriod() const { return _period; }

	//获得连续DDO数量
	int GetConsecutiveDaysOff() const { return _consecutiveDaysOff; }

	//获得最小次数
	int GetMinTimes() const { return _minTimes; }

	//获得最大次数
	int GetMaxTimes() const { return _maxTimes; }
};

#endif //_CONSECUTIVEDUTYDAYSOFFFORHXRULEPARAM_H_