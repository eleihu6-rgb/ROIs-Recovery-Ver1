/**
 * @file CheckAllowedMultiSectorDutyForFreighterForSQRuleParam.h
 * @brief Rule parameters for SQ mid-duty base turn restriction (rule 7460).
 */
#ifndef _CHECKALLOWEDMULTISECTORDUTYFORFREIGHTERFORSQRULEPARAM_H_
#define _CHECKALLOWEDMULTISECTORDUTYFORFREIGHTERFORSQRULEPARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "violationcollector/ViolationTypeDefine.h"

class CheckAllowedMultiSectorDutyForFreighterForSQRule;

class CheckAllowedMultiSectorDutyForFreighterForSQRuleParam : public RuleParam {
    friend class CheckAllowedMultiSectorDutyForFreighterForSQRule;
public:
    explicit CheckAllowedMultiSectorDutyForFreighterForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

	constexpr static unsigned int RuleFuncId = 7462;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	enum class DutyAssignmentScope {
		ANY = 0,
		FLY = 1
	};

	enum class ParamLocation {
		SERVICE_TYPE = 0,
		SEGMENT_NUMBER_IN_DUTY = 1,
		ALLOWED_SECTORS = 2,
		DUTY_ASSIGNMENT = 3
	};

	//Duty中FLY航段的航班客机/货机类型来自flight.server_type  取值：J - 客机，F - 货机。过滤Pairing或Duty的条件，任何一个FLY航段满足即可。默认配置：F
	std::string _serviceType{};

	//Duty的Segment数量，格式: n-m，数值范围[n,m]。检查条件，默认配置：2-99
	std::string _segmentNumberInDuty{};
	int _segmentNumberInDutyStart{};
	int _segmentNumberInDutyEnd{};

	//Duty中允许航线列表，使用”-“连接同一Duty内经停站点。多个使用”|“分割，支持*表示所有。检查条件。例如：SIN-CAN-SIN 表示Duty有2个航段，经停站点顺序为：SIN、CAN、SIN
	std::vector<std::string> _allowedSectors{};

	//Rule applies to pure fly duty only, or any duty composition. Default ANY.
	DutyAssignmentScope _dutyAssignmentScope{ DutyAssignmentScope::ANY };
	std::string _dutyAssignmentScopeRaw{ "ANY" };

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchServiceType(const Duty* duty) const;

	bool MatchDutyAssignment(const Duty* duty) const;

	bool MatchSegmentNumber(const Duty* duty) const;

	bool CheckAllowedSectors(const string route) const;

	bool IsDutyPatternAllowed(const Duty* duty) const;

	std::string GetDutyRoute(const Duty* duty) const;

private:
	void ParseDutyAssignmentScope(const std::string& value);

};

#endif //_CHECKALLOWEDMULTISECTORDUTYFORFREIGHTERFORSQRULEPARAM_H_

