#pragma once

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "CalculatePairingLabel.h"


std::vector<std::shared_ptr<PairingLabelFieldDef>> getFieldDefsForSQ();

class CalculatePairingLabelForSQ : public CalculatePairingLabel {
 public:
     CalculatePairingLabelForSQ(CrewDataContext* dbData) : CalculatePairingLabel(getFieldDefsForSQ(), dbData) {}

     bool equalsLabel(const string& oldPairingLabel, const std::shared_ptr<PairingLabel>& pairingLabel) const override;

 private:
};