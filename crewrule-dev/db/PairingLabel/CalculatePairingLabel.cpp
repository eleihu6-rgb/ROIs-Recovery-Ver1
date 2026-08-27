#include "CalculatePairingLabel.h"

#include "CrewDBUtil.h"

const char PairingLabel::separator = '-';

inline static void resetPairingLabel(Pairing* pairing, const std::shared_ptr<PairingLabel>& pairingLabel, const CrewDataContext* dbData) {
    string newLabel = pairingLabel->getLabel();
    // 初次计算
    if (dbData->pairingLabelMap.count(newLabel) == 0) {
        //无重复值，直接赋值
        pairing->setLabel(newLabel);
    }
    else {
        //存在重复值，尝试候选值
        auto allCandidateLabels = pairingLabel->getAllCandidateLabel();
        if (allCandidateLabels.empty()) {
            //没有候选值，直接赋值已有值
            pairing->setLabel(newLabel);
            return;
        }
        bool matched = false;
        for (auto& candidateLabel : allCandidateLabels) {
            if (dbData->pairingLabelMap.count(candidateLabel) == 0) {
                pairing->setLabel(candidateLabel);
                matched = true;
                break;
            }
        }

        //从候选Label找不到不重复的，则仍然使用当前计算的结果。此时Pairing Label会出现重复
        if (!matched) {
            pairing->setLabel(newLabel);
        }
    }
}

void CalculatePairingLabel::calculate(Pairing* pairing, const int offsetTZMinutes) {
    std::shared_ptr<PairingLabel> pairingLabel = std::make_shared<PairingLabel>(pairing);
    pairingLabel->setFieldDefs(_fieldDefs);
    pairingLabel->calculate(offsetTZMinutes, _dbData);
    //std::cout << pairing->getDbId() << ": " << pairingLabel->getLabel() << std::endl;
    //for (auto& candidateLabel : pairingLabel->getAllCandidateLabel()) {
    //    std::cout << "\t" << candidateLabel << ", ";
    //}
    //std::cout<< std::endl;
    
    if (pairing->getLabel().empty()) {
        resetPairingLabel(pairing, pairingLabel, _dbData);
        makePairingLabelMapIndex(pairing, _dbData->pairingLabelMap);
    }
    else {
        if (!this->equalsLabel(pairing->getLabel(), pairingLabel)) {
            removePairingLabelMapIndex(pairing, _dbData->pairingLabelMap);
            resetPairingLabel(pairing, pairingLabel, _dbData);
            makePairingLabelMapIndex(pairing, _dbData->pairingLabelMap);
        }
    }
}

void CalculatePairingLabel::calculate(vector<Pairing*> pairingList, const int offsetTZMinutes) {
    for(auto pairing : pairingList) {
        calculate(pairing, offsetTZMinutes);
    }
}

