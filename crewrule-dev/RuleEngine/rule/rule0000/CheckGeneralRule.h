/**
 * @file CheckGeneralRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKGENERALRULE_H_
#define _CHECKGENERALRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../period/WorkPeriod.h"

class CheckGeneralRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 0000;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckGeneralRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckGeneralRule::RuleFuncId, CheckGeneralRule::AvailableInterface) {

	}
	~CheckGeneralRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	bool _debug_RO = false;

	enum class WarnCode {
		NO_WARN = 0, //无告警
		FDP_EXTENSION_WARN = 1, //MAX FTP不满足告警
		FT_EXTENSION_WARN = 2, //Max FT不满足告警,
		MIN_REST_WARN = 4, //MIN REST不满足告警
		MAX_DP_WARN = 8 //MAX DP不满足告警
	};

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(const Duty* currDuty, const Duty* nextDuty) const;

	int CheckAllRule(const Duty* currDuty, const Duty* nextDuty) const;

	//callinSBY_FDPMins: SBY与FDP重叠部分，计入FDP时间
	bool CheckMaxFDP(const Duty* currDuty, const long callinSBY_FDPMins = 0) const;
	
	bool CheckMaxFT(const Duty* currDuty) const;

	bool CheckMaxDP(const Duty* currDuty, ROSTER* roster = nullptr) const;

	bool CheckMinRest(const Duty* currDuty, const Duty* nextDuty) const;

	bool CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods) const;

	bool CheckRule(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod) const;

	bool CheckRuleForGround(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod) const;

	int CheckAllRule(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod) const;

	bool CheckMinRest(const Duty* currDuty, const WorkPeriod* nextWorkPeriod) const;

	//抛出违反Max FDP规则的告警
	void ThrowFdpDiscretioRuleViolation(const Duty* duty) const;

	//抛出违反Max FT规则的告警
	void ThrowFtDiscretioRuleViolation(const Duty* duty) const;

	//抛出违反Max DP规则的告警
	void ThrowDpDiscretioRuleViolation(const Duty* duty, ROSTER* roster = nullptr) const;

	//抛出违反Min Rest规则的告警
	void ThrowMinRestRuleViolation(const Duty* duty) const;
	void ThrowMinRestRuleViolation(const ROSTER* roster) const;

	//检查法规是否配置Exception Code，若配置则忽略检查返回true，否则返回false
	bool IgnoreCheck(const ROSTER* roster, const Duty* duty, const RULE_LIMITATION_TYPE type) const;
	bool IgnoreCheck(const Duty* duty, const RULE_LIMITATION_TYPE type) const;

};

#endif //_CHECKMINRESTRULE_H_
