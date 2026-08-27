/**
 * @file FdpExtensionWithInFlightRestForCcConfigParam.h
 * @brief 7029法规 Table1 参数类 - 机上休息扩展Max FDP和Min Rest
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-09
**/

#ifndef _FDPEXTENSIONWITHINFLIGHTRESTFORCCCONFIGPARAM_H_
#define _FDPEXTENSIONWITHINFLIGHTRESTFORCCCONFIGPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/TimeRangeMatchExpression.h"
#include "matcher/NumericRangeMatchExpression.h"

#include <string>
#include <limits>
#include <vector>

class CalculateFdpExtensionWithInFlightRestOfCcForTGRule;
class FdpExtensionWithInFlightRestForCcRuleParam;

/**
 * Table1参数：机上休息扩展Max FDP和Min Rest
 */
class FdpExtensionWithInFlightRestForCcConfigParam : public RuleParam {
	friend class CalculateFdpExtensionWithInFlightRestOfCcForTGRule;
	friend class FdpExtensionWithInFlightRestForCcRuleParam;
private:
	explicit FdpExtensionWithInFlightRestForCcConfigParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7029;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 8;

	enum class ParamLocation {
		ACC_STATE = 0,
		SECTORS_RANGE = 1,
		REST_FACILITY = 2,
		OVERRIDE_DUTY_ATTRIBUTES = 3,
		INFLIGHT_REST_RANGE = 4,
		GROUP = 5,
		MAX_FDP = 6,
		MIN_REST = 7
	};

	//适用状态。取值：D/B/X，多个使用|分割，支持*通配
	std::string _accState{};
	std::vector<std::string> _accStates{};

	//Sectors Range飞行航段的数量范围，不包括：DHD等。格式：n-m，取值范围：[n,m]
	std::string _sectorsRange{};
	NumericRangeMatchExpression _sectorsRangeMatch;

	//Rest Facility。取值：0/1/2/3，多个使用|分割，支持*
	std::string _restFacility{};
	std::vector<std::string> _restFacilities{};

	//Override Duty Attributes。多个使用|分割，支持*
	std::string _overrideDutyAttributes{};
	std::vector<std::string> _overrideDutyAttributeList{};

	//In-flight Rest Range。格式：hh:mm-hh:mm，取值范围：[hh:mm,hh:mm)
	std::string _inflightRestRange{};
	TimeRangeMatchExpression _inflightRestRangeMatch;

	//Group。分批轮休次数
	int _group{0};

	//Max FDP。格式：hh:mm
	std::string _maxFdp{};
	int _maxFdpMinutes{0};

	//Min Rest。格式：hh:mm
	std::string _minRest{};
	int _minRestMinutes{0};

	void ParseParam(const std::string& paramString);
	void ParseParam(const DBRule& dbRule);

private:
	//匹配Duty的适应状态
	bool MatchAccState(const Duty* duty) const;

	//匹配Duty的sector range
	bool IsSectorInRange(const Duty* duty) const;

	//匹配Rest Facility
	bool MatchRestFacility(const Duty* duty) const;

	//匹配Override Duty Attributes
	bool MatchOverrideDutyAttributes(const Duty* duty) const;

public:
	int GetGroup() const { return _group; }

	int GetMaxFdpMinutes() const { return _maxFdpMinutes; }

	int GetMinRestMinutes() const { return _minRestMinutes; }

	bool MatchParam(const Duty* duty) const;

	bool MatchInFlightRest(const int inFlightRestMinutes) const;
};

#endif //_FDPEXTENSIONWITHINFLIGHTRESTFORCCCONFIGPARAM_H_
