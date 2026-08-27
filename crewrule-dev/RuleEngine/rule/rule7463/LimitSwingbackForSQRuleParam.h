/**
 * @file LimitSwingbackForSQRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-16
**/

#ifndef _LIMITSWINGBACKFORSQRULEPARAM_H_
#define _LIMITSWINGBACKFORSQRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>
#include <vector>

class LimitSwingbackForSQRule;

class LimitSwingbackForSQRuleParam : public RuleParam {
	friend class LimitSwingbackForSQRule;
private:
    explicit LimitSwingbackForSQRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7463;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

    enum class ParamLocation {
		SERVICE_TYPE = 0,
		FLEET_GROUP = 1,
		SWINGBACK_TZ_DIFF = 2,
		SAME_TZ_TOLERANCE = 3,
		MAX_SWINGBACK = 4,
		SEVERITY = 5
    };

	// Pairing/duty service type filter: '*' (any), 'J' (passenger), 'F' (freighter).
	std::string _serviceTypeUpper{"*"};
	// Fleet group filter: empty (any), otherwise require operating fleet group in this list.
	std::vector<std::string> _fleetGroupsUpper{};

	//折返时区差范围（分钟数范围）,格式：HH:mm-HH:mm, 取值范围：[HH:mm, HH:mm],举例：03:00-99:00
	std::string _swingbackTZDiff{};
	int _swingbackTZDiffMinutesLower{};
	int _swingbackTZDiffMinutesUpper{9999};

	//相同时区允许公差值，格式：HH:mm，举例：00:00
	std::string _sameTZTolerance{};
	int _sameTZToleranceMinutes{};

	//最大折返次数
	int _maxSwingbackCount{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//匹配abs (tz2 - tz1) >= 3 
	bool MatchSwingbackTZDiff(const Duty* duty1, const Duty* duty2, const Duty* duty3) const;
	bool MatchSwingbackTZDiff(const Duty* prevDuty, const Duty* currDuty) const;

	//匹配abs(tz1 - tz3)<tolerance
	bool MatchTZTolerance(const Duty* duty1, const Duty* duty3) const;
public:

	//匹配是否满足参数
	bool MatchParam(const Duty* duty1, const Duty* duty2, const Duty* duty3) const;

};

#endif //_LIMITSWINGBACKFORSQRULEPARAM_H_
