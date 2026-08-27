/**
 * @file CumulativeFtLimitForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CUMULATIVEFTLIMITFOREVAFDRULEPARAM_H_
#define _CUMULATIVEFTLIMITFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckCumulativeFtLimitForEvaFdRule;
class CumulativeFtLimitSlideListener;

class CumulativeFtLimitForEvaFdRuleParam : public RuleParam {
friend class CheckCumulativeFtLimitForEvaFdRule;
friend class CumulativeFtLimitSlideListener;
private:
    explicit CumulativeFtLimitForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7202;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		ASSIGNMENTS = 3,
		COMPOSITIONS = 4,
		PERIOD = 5,
		UNIT = 6,
		MAX_BLH = 7,
		SEVERITY = 8
    };

	//所属基地,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _bases{};
	//人员级别,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _ranks{};
	//人员机型,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _fleets{};
	//任务类型,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _assignments{};
	//配比,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _compositions{};
	//时间周期,例如：7
	unsigned int _timePeriod{};
	//时间周期单位,CD-天(日历天，滚动计算）
	std::string _timePeriodUnit{};
	//最大飞行时间BLH（分钟数）,格式：HH:mm
	std::string _maxFT{};
	int _maxFTMinutes{};


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	//判断Duty是否满足任务类型（计算BLH的任务类型）
	bool MatchAssignments(const Duty& duty, const std::shared_ptr<CrewDataContext>& dbData) const;

	//匹配配比
	bool MatchComposition(const Duty& duty) const;

};

#endif //_CUMULATIVEFTLIMITFOREVAFDRULEPARAM_H_
