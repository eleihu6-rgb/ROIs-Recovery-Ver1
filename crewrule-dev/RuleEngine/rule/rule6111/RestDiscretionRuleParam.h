/**
 * @file RestDiscretionRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _RESTDISCRETIONRULEPARAM_H_
#define _RESTDISCRETIONRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class CheckRestDiscretionRule;
class CalculateRestDiscretionRule;

class RestDiscretionRuleParam : public RuleParam {
	friend class CheckRestDiscretionRule;
	friend class CalculateRestDiscretionRule;
private:
    explicit RestDiscretionRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6111;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		IS_HOME_BASE = 0,
		COMPOSITIONS = 1,
		ACC_STATE = 2,
		MIN_ODP_RANGES = 3,
		REDUCTION_TYPE = 4,
		REST_MAX_REDUCTION = 5,
		SEVERITY = 6
    };

	//是否在基地,取值：Y/N。*表示未设置
	std::unique_ptr<bool> _isHomeBase{ nullptr };

	//配比名称,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _compositions{};

	//适用状态,取值：A-适应状态，U-未知状态，支持通配符“*”表示所有
	std::string _acclimatizationState{};

	//最小休息范围,格式：HH:mm-HH:mm，支持*表示忽略
	std::string _minRestRanges{};
	int _minRestMinutesLower{ 0 };
	int _minRestMinutesUpper{ 0 };

	//最小休息减少类型，R:最小休息减少X分钟，T:最小休息减少到X分钟
	std::string _reductionType{ "R" };

	//Rest最大减小值,格式：HH:mm
	std::string _restMaxReduction{};
	int _restMaxReductionMinutes{ 0 };

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	bool MatchComposition(const Duty& duty) const;

	bool MatchAcclimatizationState(const Duty* nextDuty) const;

	bool MatchMinRestRanges(const Duty& duty) const;

	//检查Rest Reduction是否满足
	bool CheckRestReduction(const Duty* currDuty, const Duty* nextDuty) const;

public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		REST_REDUCTION_WARN = 1 //REST减小后仍然不满足后告警
	};

	//匹配是否满足参数
	bool MatchParam(const Duty* currDuty, const Duty* nextDuty, const std::string& base) const;

	//检查是否满足参数
	WarnCode CheckParam(const Duty* currDuty, const Duty* nextDuty) const;
};

#endif //_RESTDISCRETIONRULEPARAM_H_
