#ifndef _CHECKRENEWCERTINADVANCEFOREVAFDRULE_H_
#define _CHECKRENEWCERTINADVANCEFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckRenewCertInAdvanceForEvaFdRuleParam.h"

class CheckRenewCertInAdvanceForEvaFdRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7231;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckRenewCertInAdvanceForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckRenewCertInAdvanceForEvaFdRule::RuleFuncId, CheckRenewCertInAdvanceForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckRenewCertInAdvanceForEvaFdRule() override = default;

	bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

	std::vector<CheckRenewCertInAdvanceForEvaFdRuleParam> _ruleParams;

	bool CheckRule(const vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	bool CheckRule(map<string, set<long long>>& validRosterIdsMap, const vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const std::shared_ptr<CREW_QUALIFICATION>& qual, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	bool CheckRule(bool& matched, const ROSTER* roster, const std::shared_ptr<CREW>& crew, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	bool CheckRule(bool& matched, const ROSTER* roster, const Segment* segment, const std::shared_ptr<CREW>& crew, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	//获得检查的结束时间，必须满足 (endTimeUtc - qualExpiryUtc) > 5工作日
	time_t GetEndTimeUtc(const time_t qualExpiryUtc, const std::shared_ptr<CREW>& crew, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	//获得证书过期前需要安排的排班列表
	vector<const ROSTER*> GetRenewalCertRosters(map<string, map<long long, tuple<const ROSTER*, const Segment*>>>& exceptionAssignedRosterMap, const vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const time_t startTimeUtc, const time_t endTimeUtc, const std::shared_ptr<CREW_QUALIFICATION>& qual, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForHoliday(const ROSTER* roster, const Segment* segment, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForWeekday(const ROSTER* roster, const Segment* segment, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForNoAssigment(const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForOnlyRenewalWindow(const ROSTER* roster, const Segment* segment, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const;

	void ParseParam(const InputType& input);
};

#endif //_CHECKRENEWCERTINADVANCEFOREVAFDRULE_H_
