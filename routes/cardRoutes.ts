import {Router} from 'express'
import cardController from '../controllers/cardController'

const router = Router()

router.get('/:id', cardController.getCard)
export default router